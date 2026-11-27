import { GET as downloadPdf } from "@/app/api/grader/pdf/[slug]/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = downloadPdf;
