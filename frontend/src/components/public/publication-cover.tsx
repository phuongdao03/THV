import Image from "next/image";

export function PublicationCover({
  title,
  category,
}: {
  title: string;
  category: string;
}) {
  return (
    <div
      aria-label={"Bìa mặc định: " + title}
      className="relative flex h-full min-h-0 w-full flex-col justify-between overflow-hidden bg-[#281c18] p-[7%] text-[#fff2da]"
      role="img"
    >
      <Image
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-1/2 -right-1/4 w-4/5 max-w-none opacity-15"
        height={480}
        loading="eager"
        src="/assets/brand/trong-dong.png"
        width={480}
      />
      <div className="relative flex items-center gap-2 text-xs font-semibold tracking-wide">
        <Image
          alt=""
          height={24}
          src="/assets/brand/thv-brand-emblem.png"
          width={24}
        />
        Tinh Hoa Việt
      </div>
      <div className="relative border-l border-[#b38b55] pl-3">
        <p className="truncate text-xs text-[#e6c595]">{category}</p>
        <p className="mt-1 line-clamp-3 break-words font-serif text-lg font-semibold leading-tight sm:text-2xl">
          {title}
        </p>
      </div>
    </div>
  );
}
