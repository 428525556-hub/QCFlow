import { NextResponse, type NextRequest } from "next/server";

import { apiFailure } from "@/src/server/apiResponse";
import { normalizeError } from "@/src/server/errors";
import { requireStaffProfile } from "@/src/server/supabaseServer";
import { buildImportTemplateWorkbook } from "@/src/services/excelImportService";

export async function GET(request: NextRequest) {
  try {
    await requireStaffProfile(request);
  } catch (error) {
    const normalized = normalizeError(error);
    return apiFailure(normalized, normalized.status);
  }

  const workbook = buildImportTemplateWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="qcflow-reservation-import-template.xlsx"'
    }
  });
}
