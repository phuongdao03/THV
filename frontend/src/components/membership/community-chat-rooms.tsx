import { MessageCircle, UsersRound } from "lucide-react";
import Image from "next/image";

import type { CommunityChatRoom } from "@/lib/api/types";

export const chatRooms = [
  {
    key: "MEMBER",
    label: "Sảnh cộng đồng",
    audience: "Không cần gói trả phí",
    summary: "Trò chuyện cùng cộng đồng.",
  },
  {
    key: "COMPANION",
    label: "Phòng Đồng hành",
    audience: "Vàng trở lên",
    summary: "Kết nối và chia sẻ cơ hội.",
  },
  {
    key: "PRESTIGE",
    label: "Phòng Tinh hoa",
    audience: "Kim cương",
    summary: "Trao đổi chuyên sâu cùng hội viên.",
  },
] as const satisfies readonly {
  key: CommunityChatRoom;
  label: string;
  audience: string;
  summary: string;
}[];

export function parseChatRoom(value: unknown): CommunityChatRoom | undefined {
  return chatRooms.find((room) => room.key === value)?.key;
}

export function ChatRoomIcon({ room }: { room: CommunityChatRoom }) {
  return (
    <span aria-hidden="true" className="member-chat-icon" data-room={room}>
      {room === "PRESTIGE" ? (
        <Image
          src="/assets/brand/trong-dong.png"
          alt=""
          width={24}
          height={24}
        />
      ) : room === "COMPANION" ? (
        <UsersRound size={21} />
      ) : (
        <MessageCircle size={21} />
      )}
    </span>
  );
}
