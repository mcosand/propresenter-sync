"use client";

import { TransferDialog } from "@/components/playlists/TransferDialog";
import { useParams } from "next/navigation";

export default function TransferItem() {
  const { slug } = useParams();
  return (
    <TransferDialog id={(slug as string[] ?? []).join('/')} />
  );
}