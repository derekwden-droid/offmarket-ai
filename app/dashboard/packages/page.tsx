import { Package, Layers } from "lucide-react";
import { getListPackages } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const packages = await getListPackages();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-100">
            List Packages
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Curated, hyper-niched property lists packaged for resale.
          </p>
        </div>
      </div>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
            >
              <Layers className="h-6 w-6" style={{ color: "#10B981" }} />
            </span>
            <div>
              <p className="text-sm font-medium text-gray-100">
                No packages yet
              </p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Seed the database or create packages to bundle properties for
                resale.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5 pt-5">
                <div className="flex items-start justify-between">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
                  >
                    <Package className="h-5 w-5" style={{ color: "#10B981" }} />
                  </span>
                  <span
                    className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      borderColor: "rgba(16,185,129,0.30)",
                      color: "#6EE7B7",
                      backgroundColor: "rgba(16,185,129,0.10)",
                    }}
                  >
                    {formatNumber(pkg.propertyCount)} properties
                  </span>
                </div>

                <h3 className="mt-4 text-base font-semibold tracking-tight text-gray-100">
                  {pkg.name}
                </h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">
                  {pkg.description}
                </p>

                <div className="mt-5 flex items-baseline justify-between border-t border-[#1F2937] pt-4">
                  <span className="text-2xl font-semibold tracking-tight text-gray-100">
                    {formatCurrency(pkg.price)}
                  </span>
                  <span className="text-xs text-gray-500">per list</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
