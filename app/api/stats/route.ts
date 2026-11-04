import { NextResponse } from "next/server";
import { computeStats } from "@/lib/stats";

export async function GET() {
  return NextResponse.json(computeStats());
}
