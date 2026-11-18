const stages = [
  {
    title: "Chuẩn bị thông tin và minh chứng",
    summary:
      "Khai báo đối tượng đề cử, chọn loại hồ sơ phù hợp và tập hợp thông tin liên quan.",
    details: [
      "Danh mục thông tin và tài liệu cần chuẩn bị thay đổi theo loại hồ sơ bạn chọn. Hãy làm theo các mục được hiển thị trong biểu mẫu.",
      "Bạn có thể lưu bản nháp, bổ sung hình ảnh, video hoặc tài liệu liên quan rồi kiểm tra lại trước khi gửi.",
    ],
  },
  {
    title: "Gửi hồ sơ",
    summary:
      "Rà soát thông tin và xác nhận gửi hồ sơ khi đã hoàn thiện các mục bắt buộc.",
    details: [
      "Trước khi xác nhận, hãy kiểm tra thông tin khai báo, tài liệu và các mục bắt buộc trong biểu mẫu.",
      "Sau khi hồ sơ được ghi nhận, bạn có thể tiếp tục theo dõi trạng thái và phản hồi mới nhất trong tài khoản.",
    ],
  },
  {
    title: "Tiếp nhận và thẩm định",
    summary:
      "Theo dõi tình trạng hồ sơ trong tài khoản và phản hồi nếu có yêu cầu bổ sung.",
    details: [
      "Hồ sơ đã gửi được tiếp nhận theo điều kiện của quy trình. Bạn có thể xem trạng thái và phản hồi mới nhất trong hồ sơ của mình.",
      "Nếu cần bổ sung, hồ sơ sẽ nêu rõ nội dung cần cập nhật. Bạn có thể chỉnh sửa phần được yêu cầu và gửi lại khi chức năng này được mở cho hồ sơ.",
    ],
  },
  {
    title: "Nhận kết quả xem xét",
    summary:
      "Đọc quyết định, phản hồi và hướng dẫn về các bước tiếp theo trong hồ sơ.",
    details: [
      "Kết quả có thể yêu cầu bổ sung, không chấp thuận hoặc cho phép hồ sơ đi tiếp. Hãy căn cứ vào nội dung phản hồi cụ thể trong tài khoản.",
      "Được chấp thuận là một quyết định về hồ sơ; việc cấp bằng xác lập và công bố là những mốc riêng, cần có quyết định và trạng thái tương ứng.",
    ],
  },
  {
    title: "Công bố và quản lý hồ sơ",
    summary:
      "Theo dõi công bố và thông tin đã được phép hiển thị theo quyết định thực tế.",
    details: [
      "Chỉ hồ sơ đáp ứng điều kiện và có quyết định phù hợp mới được công bố. Thông tin, tài liệu, kết quả và lịch sử được quản lý trong hồ sơ theo quyền truy cập hiện hành.",
      "Quảng bá là lựa chọn riêng, không phải điều kiện để công bố. Nếu hồ sơ đủ điều kiện, bạn có thể xem các lựa chọn quảng bá đang được cung cấp.",
    ],
  },
] as const;

const outcomes = [
  {
    title: "Cần bổ sung",
    description:
      "Xem nội dung cần cập nhật trong hồ sơ. Bạn chỉ chỉnh sửa phần được yêu cầu và gửi lại khi hệ thống cho phép.",
  },
  {
    title: "Không được chấp thuận",
    description:
      "Đọc kết quả và phản hồi kèm theo trong tài khoản. Hướng xử lý tiếp theo căn cứ vào nội dung quyết định của hồ sơ.",
  },
  {
    title: "Đủ điều kiện đi tiếp",
    description:
      "Theo dõi hướng dẫn và trạng thái tiếp theo. Chấp thuận hồ sơ không tự động đồng nghĩa với cấp bằng hoặc công bố.",
  },
] as const;

const questions = [
  {
    question: "Tôi có thể bổ sung tài liệu sau khi gửi không?",
    answer:
      "Trong thời gian xem xét, hồ sơ được khóa chỉnh sửa. Nếu có yêu cầu bổ sung, bạn có thể cập nhật phần được yêu cầu và gửi lại theo hướng dẫn hiển thị trong hồ sơ.",
  },
  {
    question: "Tôi theo dõi hồ sơ bằng cách nào?",
    answer:
      "Đăng nhập tài khoản, mở mục hồ sơ của bạn và chọn hồ sơ cần xem. Trạng thái, phản hồi và yêu cầu bổ sung mới nhất được hiển thị tại đó.",
  },
  {
    question: "Tôi có bắt buộc mua quảng bá sau khi được duyệt?",
    answer:
      "Không. Quảng bá là lựa chọn riêng, không phải điều kiện công bố. Bạn có thể theo dõi công bố thông thường; lựa chọn quảng bá chỉ xuất hiện khi hồ sơ đáp ứng điều kiện của chức năng đó.",
  },
] as const;

export function ProcessJourney() {
  return (
    <>
      <section
        aria-labelledby="process-journey-title"
        className="process-journey"
        id="process-details"
      >
        <div className="process-journey__inner">
          <header className="process-journey__intro">
            <p className="public-information-kicker">CÁC GIAI ĐOẠN</p>
            <h2 id="process-journey-title">Từ chuẩn bị hồ sơ đến kết quả</h2>
            <p>
              Mỗi giai đoạn có việc cần làm và thông tin riêng. Mở phần hướng
              dẫn để xem chi tiết.
            </p>
          </header>

          <div className="process-journey__layout">
            <ol
              aria-label="Năm giai đoạn đề cử và xác lập"
              className="process-journey__steps"
            >
              {stages.map((stage, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                  <li className="process-stage" key={stage.title}>
                    <span aria-hidden="true" className="process-stage__number">
                      {number}
                    </span>
                    <article className="process-stage__content">
                      <p className="process-stage__label">GIAI ĐOẠN {number}</p>
                      <h3>{stage.title}</h3>
                      <p className="process-stage__summary">{stage.summary}</p>
                      <details className="process-stage__details">
                        <summary>Chi tiết giai đoạn {number}</summary>
                        <div className="process-stage__detail-copy">
                          {stage.details.map((detail) => (
                            <p key={detail}>{detail}</p>
                          ))}
                        </div>
                      </details>
                    </article>
                  </li>
                );
              })}
            </ol>

            <aside
              aria-labelledby="process-preparation-title"
              className="process-sidebar"
            >
              <p className="process-sidebar__label">TRƯỚC KHI GỬI</p>
              <h3 id="process-preparation-title">Chuẩn bị có trọng tâm</h3>
              <div className="process-sidebar__item">
                <h4>Tài liệu</h4>
                <p>
                  Danh mục hồ sơ hiển thị theo loại đề cử. Chuẩn bị minh chứng
                  liên quan và làm theo hướng dẫn trong biểu mẫu.
                </p>
              </div>
              <div className="process-sidebar__item">
                <h4>Theo dõi</h4>
                <p>
                  Sau khi hồ sơ được ghi nhận, bạn xem trạng thái và phản hồi
                  trong tài khoản.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="process-outcomes-title"
        className="process-outcomes"
      >
        <div className="process-outcomes__inner">
          <header className="process-outcomes__intro">
            <p className="public-information-kicker">KẾT QUẢ CÓ THỂ GẶP</p>
            <h2 id="process-outcomes-title">
              Mỗi hồ sơ có thể đi theo hướng khác nhau
            </h2>
            <p>
              Kết quả và bước tiếp theo sẽ được thông báo theo quyết định thực
              tế của hồ sơ.
            </p>
          </header>
          <ol className="process-outcomes__list">
            {outcomes.map((outcome, index) => (
              <li className="process-outcomes__item" key={outcome.title}>
                <span aria-hidden="true" className="process-outcomes__index">
                  0{index + 1}
                </span>
                <div>
                  <h3>{outcome.title}</h3>
                  <p>{outcome.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="process-faq-title" className="process-faq">
        <div className="process-faq__inner">
          <header className="process-faq__intro">
            <p className="public-information-kicker">CÂU HỎI THƯỜNG GẶP</p>
            <h2 id="process-faq-title">Thông tin cần biết</h2>
            <p>
              Các bước tiếp theo được xác nhận theo tình trạng hồ sơ thực tế.
            </p>
          </header>
          <div className="process-faq__list">
            {questions.map(({ answer, question }) => (
              <details className="process-faq__item" key={question}>
                <summary>
                  <span>{question}</span>
                  <span aria-hidden="true" className="process-faq__toggle">
                    +
                  </span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
