import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ProcessJourney } from "@/components/public/process-journey";
import { isPreviewRelease } from "@/lib/release-mode";

function ProcessActions({ submissionOpen }: { submissionOpen: boolean }) {
  const submissionHref = submissionOpen
    ? "/dossiers/new"
    : "/coming-soon/submission";

  return (
    <section aria-labelledby="process-next-title" className="process-next">
      <div className="process-next__inner">
        <div>
          <p className="public-information-kicker">BƯỚC TIẾP THEO</p>
          <h2 id="process-next-title">Sẵn sàng gửi đề cử?</h2>
          <p>
            Bạn có thể tạo bản nháp trước, chuẩn bị tài liệu và kiểm tra lại mọi
            thông tin trước khi xác nhận gửi.
          </p>
        </div>
        <div className="process-next__actions">
          <Link className="process-next__primary" href={submissionHref}>
            Tạo hồ sơ đề cử
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          <Link className="process-next__secondary" href="/verify">
            Tra cứu kết quả
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function ProcessPage() {
  const preview = isPreviewRelease();
  const submissionHref = preview ? "/coming-soon/submission" : "/dossiers/new";

  return (
    <div className={`process-page${preview ? " process-page--preview" : ""}`}>
      <header className="public-page-header process-hero">
        <div className="process-hero__inner">
          <div className="process-hero__copy">
            <p className="public-information-kicker">
              TRUNG TÂM ĐỀ CỬ VÀ XÁC LẬP TINH HOA VIỆT
            </p>
            <h1>Quy trình đề cử và xác lập</h1>
            <p className="process-hero__description">
              Tìm hiểu từng giai đoạn, từ chuẩn bị hồ sơ, hoàn tất thủ tục đến
              tiếp nhận kết quả. Bạn có thể theo dõi trạng thái và các yêu cầu
              bổ sung trong tài khoản của mình.
            </p>
            <div className="process-hero__actions">
              <Link className="process-hero__primary" href={submissionHref}>
                Bắt đầu gửi hồ sơ
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link className="process-hero__secondary" href="#process-details">
                Xem các giai đoạn
              </Link>
            </div>
            {preview ? (
              <p className="process-hero__availability">
                Cổng gửi hồ sơ được mở theo từng giai đoạn.
              </p>
            ) : null}
          </div>

          <aside
            aria-labelledby="process-principle-title"
            className="process-principle"
          >
            <p className="process-principle__label">NGUYÊN TẮC XEM XÉT</p>
            <h2 id="process-principle-title">
              Mỗi hồ sơ được xem xét theo thông tin và minh chứng đã gửi.
            </h2>
            <p>
              Việc gửi hồ sơ không đồng nghĩa với việc chắc chắn được chấp
              thuận, công bố hay cấp bằng xác lập.
            </p>
          </aside>
        </div>
      </header>

      <ProcessJourney />
      <ProcessActions submissionOpen={!preview} />
    </div>
  );
}
