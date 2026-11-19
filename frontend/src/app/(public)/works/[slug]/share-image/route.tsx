import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { loadPublicWork } from "@/lib/api/public-work-server";
import { resolveServerApiBaseUrl } from "@/lib/api/server-base-url";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const result = await loadPublicWork((await params).slug);
  if (result.kind !== "detail") return new Response(null, { status: 404 });
  const work = result.detail;
  const cover = work.media.find(
    (item) =>
      item.isThumbnail && (item.kind === "IMAGE" || item.kind === "VIDEO"),
  );
  if (
    cover &&
    /^[0-9a-f-]{36}$/i.test(work.id) &&
    /^[0-9a-f-]{36}$/i.test(cover.id)
  ) {
    try {
      const image = await fetch(
        `${resolveServerApiBaseUrl()}/api/v1/public/works/${work.id}/media/${cover.id}?${cover.kind === "IMAGE" ? "cover=true" : "poster=true"}`,
        {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(3000),
        },
      );
      const type = image.headers.get("content-type");
      if (
        image.ok &&
        image.body &&
        /^(image\/(jpeg|png|webp))$/i.test(type ?? "")
      ) {
        return new Response(image.body, {
          headers: { ...responseHeaders, "Content-Type": type! },
        });
      }
    } catch {
      // A missing or unavailable derivative uses the branded cover.
    }
  }
  const emblem = await readFile(
    join(process.cwd(), "public/assets/brand/thv-brand-emblem.png"),
  )
    .then((data) => `data:image/png;base64,${data.toString("base64")}`)
    .catch(() => null);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#281c18",
          color: "#fff2da",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 30,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders to PNG. */}
          {emblem ? <img alt="" src={emblem} width={48} height={48} /> : null}
          Tinh Hoa Việt
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderLeft: "3px solid #b38b55",
            paddingLeft: 28,
          }}
        >
          <div style={{ color: "#e6c595", fontSize: 28 }}>
            {work.categoryName}
          </div>
          <div
            style={{
              fontSize: work.title.length > 115 ? 44 : 60,
              fontWeight: 700,
            }}
          >
            {work.title}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: responseHeaders },
  );
}
