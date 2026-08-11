import Link from "next/link";
import { ConflictList } from "./ConflictList";

export const metadata = { title: "Unsaved changes — Event Planner Suite" };

export default async function ConflictsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <Link href={`/workspace/${workspaceId}/members`} className="text-sm text-slate-600 hover:text-slate-900">
          ← Workspace
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Changes that didn&rsquo;t save</h1>
        <p className="text-sm text-slate-600">
          Somebody else edited the same thing first. Nothing has been thrown away — your version is
          still on this device, and you choose which one to keep.
        </p>
      </div>

      {/*
        Read on the client: the conflicts are in this browser's IndexedDB, because they are about
        writes this device failed to make. No server knows they exist.
      */}
      <ConflictList />
    </main>
  );
}
