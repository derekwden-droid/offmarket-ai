import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: "rgba(59,130,246,0.12)" }}
      >
        <Compass className="h-6 w-6" style={{ color: "#3B82F6" }} />
      </span>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-gray-100">
          404
        </p>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          This page is off the map. The address you requested does not exist in
          this workspace.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex h-10 items-center rounded-lg bg-[#10B981] px-5 text-sm font-medium text-[#04190F] transition-colors hover:bg-[#059669]"
        style={{ boxShadow: "0 0 15px rgba(16,185,129,0.30)" }}
      >
        Back to dashboard
      </Link>
    </main>
  );
}
