import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HistoricalAccountLinkControl } from "./historical-account-link-control";

const api = vi.hoisted(() => ({
  findLinkableAccount: vi.fn(),
  linkAccount: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ historicalNominationApi: api }));
beforeEach(() => vi.resetAllMocks());

it("requires explicit account confirmation and a reason after lookup", async () => {
  api.findLinkableAccount.mockResolvedValue({
    id: "user-1",
    email: "recipient@test.example",
  });
  api.linkAccount.mockResolvedValue({ linkedUserId: "user-1" });
  const onLinked = vi.fn();
  render(
    <HistoricalAccountLinkControl
      recordId="record-1"
      personId="person-1"
      onLinked={onLinked}
    />,
  );
  fireEvent.change(screen.getByLabelText("Email tài khoản đã đăng ký"), {
    target: { value: "recipient@test.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tìm tài khoản" }));
  await screen.findByText("recipient@test.example");
  expect(api.linkAccount).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Căn cứ liên kết"), {
    target: { value: "Đã đối chiếu đúng người nhận" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Xác nhận liên kết tài khoản" }),
  );
  await screen.findByText(/Đã liên kết tài khoản/);
  expect(api.linkAccount).toHaveBeenCalledWith("record-1", "person-1", {
    userId: "user-1",
    reason: "Đã đối chiếu đúng người nhận",
  });
  await waitFor(() => expect(onLinked).toHaveBeenCalledOnce());
});

it("clears the selected account when staff edits the lookup email", async () => {
  api.findLinkableAccount.mockResolvedValue({
    id: "user-1",
    email: "recipient@test.example",
  });
  render(
    <HistoricalAccountLinkControl
      recordId="record-1"
      personId="person-1"
      onLinked={vi.fn()}
    />,
  );
  const email = screen.getByLabelText("Email tài khoản đã đăng ký");
  fireEvent.change(email, { target: { value: "recipient@test.example" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm tài khoản" }));
  await screen.findByText("recipient@test.example");
  fireEvent.change(email, { target: { value: "other@test.example" } });
  expect(
    screen.queryByRole("button", { name: "Xác nhận liên kết tài khoản" }),
  ).toBeNull();
  expect(api.linkAccount).not.toHaveBeenCalled();
});
