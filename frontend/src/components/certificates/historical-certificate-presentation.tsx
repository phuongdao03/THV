import Image from "next/image";

export function HistoricalCertificatePresentation({
  title,
  subject,
  recipient,
  number,
  issuedAt,
  issuer,
}: {
  title: string;
  subject?: string | null;
  recipient?: string | null;
  number?: string | null;
  issuedAt?: string | null;
  issuer?: string | null;
}) {
  return (
    <section
      aria-label="Bản trình bày bằng xác lập lịch sử"
      className="relative isolate overflow-hidden border-4 border-[#720b17] bg-[#fffcf5] p-3 text-[#2b1714] sm:p-6"
    >
      <Image
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-4 right-0 -z-10 h-auto w-3/4 opacity-[0.07]"
        src="/assets/brand/trong-dong.png"
        width={800}
        height={800}
      />
      <div className="relative border border-[#ad8a35] p-5 sm:p-10">
        <header className="text-center">
          <p className="text-xs uppercase tracking-widest text-[#916c23]">
            Đề cử Tinh Hoa Việt
          </p>
          <h3 className="mt-4 font-serif text-3xl font-bold uppercase sm:text-5xl">
            Bằng xác lập
          </h3>
          <div className="mx-auto my-6 h-28 w-28 overflow-hidden rounded-full border-2 border-[#b7882f] sm:h-40 sm:w-40">
            <Image
              alt="Trung tâm xác lập Tinh Hoa Việt"
              className="h-full w-full scale-[1.235] object-contain"
              height={160}
              src="/assets/brand/logo-tinh-hoa-viet.png"
              width={160}
            />
          </div>
          <p className="text-sm text-[#786b61]">
            Ghi nhận tác phẩm · Tôn vinh giá trị Việt
          </p>
        </header>
        <div className="mt-6 space-y-5 border-t-2 border-[#ad8a35] pt-5">
          <p className="text-sm">Số bằng: {number || "Chưa ghi nhận"}</p>
          <div className="border-l-4 border-[#ad8a35] bg-[#f4efd9] p-4">
            <p className="text-xs uppercase text-[#916c23]">
              Tên bằng / danh hiệu
            </p>
            <p className="mt-2 break-words font-serif text-2xl font-semibold">
              {title}
            </p>
          </div>
          {subject ? <p>Đối tượng được ghi nhận: {subject}</p> : null}
          <p>Người được cấp: {recipient || "Chưa ghi nhận"}</p>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <p>Đơn vị cấp: {issuer || "Chưa ghi nhận"}</p>
            <p>Ngày cấp: {issuedAt || "Chưa ghi nhận"}</p>
          </div>
        </div>
        <footer className="mt-8 border-t border-[#ad8a35]/40 pt-4 text-xs text-[#786b61]">
          Tư liệu lịch sử · Bản trình bày từ thông tin bằng đã cấp. Không có xác
          thực blockchain.
        </footer>
      </div>
    </section>
  );
}
