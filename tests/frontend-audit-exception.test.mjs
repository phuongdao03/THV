import assert from "node:assert/strict";
import test from "node:test";

import { checkFrontendAudit } from "../infrastructure/scripts/check-frontend-audit.mjs";

function fixture(vulnerabilities = {}, counts = { high: 0, critical: 0 }) {
  return {
    report: {
      vulnerabilities,
      metadata: { vulnerabilities: counts },
    },
  };
}

function highVulnerability(via = []) {
  return { severity: "high", via };
}

function acceptedPicomatchFinding() {
  return {
    name: "picomatch",
    severity: "high",
    via: [
      {
        name: "picomatch",
        severity: "high",
        range: "<=4.0.7",
        url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
      },
    ],
  };
}

test("passes a clean audit", () => {
  const { report } = fixture();
  assert.equal(checkFrontendAudit(report, 0), false);
});

test("rejects unaccepted high and critical findings", () => {
  const { report } = fixture(
    {
      vulnerable: { severity: "high" },
      critical: { severity: "critical" },
    },
    { high: 1, critical: 1 },
  );
  assert.throws(() => checkFrontendAudit(report, 1), /vulnerable, critical/);
});

test("accepts high findings only when every high-severity path reaches the exact picomatch advisory", () => {
  const { report } = fixture(
    {
      picomatch: acceptedPicomatchFinding(),
      micromatch: highVulnerability(["picomatch"]),
      "eslint-config-next": highVulnerability(["micromatch"]),
    },
    { high: 3, critical: 0 },
  );

  assert.equal(checkFrontendAudit(report, 1), true);
});

test("rejects an unrelated advisory even when another high path is accepted", () => {
  const { report } = fixture(
    {
      picomatch: acceptedPicomatchFinding(),
      unrelated: {
        name: "unrelated",
        severity: "high",
        via: [
          {
            name: "unrelated",
            severity: "high",
            range: "<2.0.0",
            url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz",
          },
        ],
      },
      dependent: highVulnerability(["picomatch", "unrelated"]),
    },
    { high: 3, critical: 0 },
  );

  assert.throws(() => checkFrontendAudit(report, 1), /unrelated, dependent/);
});

test("rejects critical findings and an expired advisory exception", () => {
  const critical = fixture(
    {
      picomatch: acceptedPicomatchFinding(),
      dependent: { severity: "critical", via: ["picomatch"] },
    },
    { high: 1, critical: 1 },
  );
  assert.throws(() => checkFrontendAudit(critical.report, 1), /dependent/);

  const high = fixture(
    { picomatch: acceptedPicomatchFinding() },
    { high: 1, critical: 0 },
  );
  assert.throws(
    () => checkFrontendAudit(high.report, 1, new Date("2026-12-19T00:00:00Z")),
    /exception expired/,
  );
});

test("rejects incomplete or failed audit responses", () => {
  const { report } = fixture();
  assert.throws(() =>
    checkFrontendAudit({ error: { message: "registry unavailable" } }, 1),
  );
  assert.throws(() => checkFrontendAudit(report, 2));
  assert.throws(() => checkFrontendAudit(report, 1));
  report.vulnerabilities["unexpected-package"] = {
    severity: "high",
  };
  report.metadata.vulnerabilities.high = 1;
  assert.throws(() => checkFrontendAudit(report, 0));
});
