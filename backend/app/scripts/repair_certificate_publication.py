import argparse
import asyncio
import json
from dataclasses import asdict

from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.modules.council.models import CouncilCase, CouncilCaseDecision
from app.modules.dossiers.models import Dossier, DossierStatus, DossierVersion
from app.workers.certificate_tasks import _repair_publication


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Resume confirmed certificate issuance and restore missing private "
            "publication drafts."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Required safety switch before production data is repaired.",
    )
    mode.add_argument(
        "--diagnose-waivers",
        action="store_true",
        help="Count approved, fee-waived dossiers that have not advanced to PAID.",
    )
    return parser


async def _count_stalled_waivers() -> int:
    async with get_session_factory()() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(Dossier)
            .where(
                Dossier.status == DossierStatus.APPROVED,
                Dossier.submission_fee_waived_at.is_not(None),
                Dossier.deleted_at.is_(None),
                Dossier.is_test.is_(False),
                select(CouncilCase.id)
                .join(
                    DossierVersion, DossierVersion.id == CouncilCase.dossier_version_id
                )
                .where(
                    CouncilCase.dossier_id == Dossier.id,
                    CouncilCase.decision == CouncilCaseDecision.APPROVE,
                    DossierVersion.dossier_id == Dossier.id,
                    DossierVersion.version_no == Dossier.current_version_no,
                )
                .exists(),
            )
        )
        return int(count or 0)


def main() -> int:
    args = _parser().parse_args()
    if args.diagnose_waivers:
        print(
            json.dumps(
                {
                    "approved_waivers_awaiting_paid": asyncio.run(
                        _count_stalled_waivers()
                    )
                }
            )
        )
        return 0
    report = asyncio.run(_repair_publication())
    print(json.dumps(asdict(report), sort_keys=True))
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
