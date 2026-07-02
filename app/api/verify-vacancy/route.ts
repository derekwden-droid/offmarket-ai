// app/api/verify-vacancy/route.ts
import type { NextRequest } from "next/server";

import { ok, fail, handleRouteError } from "@/lib/api";
import { verifyVacancySchema } from "@/lib/validations";
import { verifyPropertyVacancy } from "@/lib/services/vacancy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = verifyVacancySchema.parse(body);
    const result = await verifyPropertyVacancy(input);

    if (!result) {
      return fail("NOT_FOUND", "Property not found.", 404);
    }

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
