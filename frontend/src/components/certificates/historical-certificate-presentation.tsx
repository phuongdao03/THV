import { DigitalCertificate } from "@/components/public/digital-certificate";
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
    <section aria-label="Bản trình bày bằng xác lập lịch sử">
      <DigitalCertificate
        data={{
          status: "PENDING",
          checkedAt: "",
          certificateNumber: number || "Chưa ghi nhận",
          assetTitle: subject || title,
          assetSummary: subject ? title : null,
          recognizedSubject: recipient || "Chưa ghi nhận",
          categoryName: null,
          issuedAt: null,
          expiresAt: null,
          version: null,
          network: null,
          contractAddress: null,
          transactionHash: null,
          confirmations: 0,
          confirmedAt: null,
          explorerUrl: null,
        }}
        historicalFacts={{ issuer, issuedAt }}
      />
    </section>
  );
}
