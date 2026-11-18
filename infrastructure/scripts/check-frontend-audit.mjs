import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ACCEPTED_ADVISORY = {
  packageName: "picomatch",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  range: "<=4.0.7",
  reason:
    "No patched npm release was available when this exception was reviewed on 2026-11-18.",
  reviewBy: "2026-12-18",
};

function isAcceptedAdvisory(packageName, finding, advisory) {
  return (
    packageName === ACCEPTED_ADVISORY.packageName &&
    finding.severity === "high" &&
    advisory.name === ACCEPTED_ADVISORY.packageName &&
    advisory.severity === "high" &&
    advisory.url === ACCEPTED_ADVISORY.url &&
    advisory.range === ACCEPTED_ADVISORY.range
  );
}

function tracesOnlyToAcceptedAdvisory(
  packageName,
  vulnerabilities,
  path = new Set(),
) {
  if (path.has(packageName)) return false;

  const finding = vulnerabilities[packageName];
  if (finding?.severity !== "high" || !Array.isArray(finding.via)) return false;

  const highCauses = finding.via.filter((cause) => {
    if (typeof cause === "string") {
      return ["high", "critical"].includes(vulnerabilities[cause]?.severity);
    }
    return cause && ["high", "critical"].includes(cause.severity);
  });
  if (highCauses.length === 0) return false;

  const nextPath = new Set(path).add(packageName);
  return highCauses.every((cause) =>
    typeof cause === "string"
      ? tracesOnlyToAcceptedAdvisory(cause, vulnerabilities, nextPath)
      : isAcceptedAdvisory(packageName, finding, cause),
  );
}

export function checkFrontendAudit(report, exitCode, now = new Date()) {
  if (exitCode !== 0 && exitCode !== 1) {
    throw new Error(`npm audit failed with exit code ${exitCode}`);
  }
  if (
    !report ||
    report.error ||
    !report.vulnerabilities ||
    !report.metadata?.vulnerabilities
  ) {
    throw new Error("npm audit returned an incomplete report");
  }

  const findings = Object.entries(report.vulnerabilities).filter(
    ([, finding]) => ["high", "critical"].includes(finding.severity),
  );
  const totals = report.metadata.vulnerabilities;
  if (findings.length !== totals.high + totals.critical) {
    throw new Error("npm audit finding count does not match its metadata");
  }
  if (findings.length === 0) {
    if (exitCode !== 0)
      throw new Error("npm audit failed without high findings");
    return false;
  }
  if (exitCode !== 1)
    throw new Error("npm audit reported high findings but exited successfully");

  const unacceptedFindings = findings
    .filter(
      ([name, finding]) =>
        finding.severity !== "high" ||
        !tracesOnlyToAcceptedAdvisory(name, report.vulnerabilities),
    )
    .map(([name]) => name);
  if (unacceptedFindings.length > 0) {
    throw new Error(
      `frontend audit found high or critical vulnerabilities: ${unacceptedFindings.join(", ")}`,
    );
  }

  if (new Date(now).toISOString().slice(0, 10) > ACCEPTED_ADVISORY.reviewBy) {
    throw new Error(
      `frontend audit exception expired on ${ACCEPTED_ADVISORY.reviewBy}: ${ACCEPTED_ADVISORY.url}`,
    );
  }

  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [, , reportPath, exitCode] = process.argv;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const exceptionAccepted = checkFrontendAudit(report, Number(exitCode));
    if (exceptionAccepted) {
      const highFindingCount = Object.values(report.vulnerabilities).filter(
        (finding) => ["high", "critical"].includes(finding.severity),
      ).length;
      console.log(
        `::warning title=Temporary frontend audit exception::${highFindingCount} high findings trace only to picomatch ${ACCEPTED_ADVISORY.url}. ${ACCEPTED_ADVISORY.reason} Review by ${ACCEPTED_ADVISORY.reviewBy} and remove the exception when a patched release is available.`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
