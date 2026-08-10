"use client";

/** FR-6 — shipping manifest: manual rows plus CSV bulk import. */

import { useState } from "react";
import {
  SHIPPING_STATUSES,
  SHIPPING_STATUS_LABELS,
  newShippingItem,
  type LogisticsPack,
  type ShippingManifestItem,
  type ShippingStatus,
} from "@event-toolkit/logistics";
import {
  Badge,
  Button,
  DateInput,
  EmptyRow,
  NumberInput,
  Select,
  Table,
  Td,
  Th,
  TextInput,
} from "@event-toolkit/ui";
import { CsvImportDialog } from "./CsvImportDialog";

const STATUS_TONES: Record<ShippingStatus, "neutral" | "info" | "success" | "warning"> = {
  not_shipped: "neutral",
  shipped: "info",
  delivered: "success",
  confirmed_onsite: "success",
};

export function ShippingManifestTable({
  pack,
  defaultShipTo,
  onUpdate,
}: {
  pack: LogisticsPack;
  defaultShipTo?: string;
  onUpdate: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
}) {
  const [importing, setImporting] = useState(false);

  const patch = (id: string, changes: Partial<ShippingManifestItem>) =>
    onUpdate((prev) => ({
      ...prev,
      shippingItems: prev.shippingItems.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    }));

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Button
          onClick={() =>
            onUpdate((prev) => ({
              ...prev,
              shippingItems: [...prev.shippingItems, newShippingItem({ shipTo: defaultShipTo ?? "" })],
            }))
          }
        >
          Add item
        </Button>
        <Button onClick={() => setImporting(true)}>Import CSV</Button>
      </div>

      <Table>
        <thead>
          <tr>
            <Th className="w-48">Item</Th>
            <Th className="w-20 text-right">Qty</Th>
            <Th className="w-44">Ship to</Th>
            <Th className="w-32">Carrier</Th>
            <Th className="w-40">Tracking</Th>
            <Th className="w-36">Ship by</Th>
            <Th className="w-40">Status</Th>
            <Th className="w-32">Owner</Th>
            <Th className="no-print w-10" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {pack.shippingItems.length === 0 ? (
            <EmptyRow colSpan={9}>Nothing on the manifest yet.</EmptyRow>
          ) : (
            pack.shippingItems.map((item) => (
              <tr key={item.id}>
                <Td>
                  <TextInput
                    value={item.item}
                    aria-label="Item"
                    onChange={(e) => patch(item.id, { item: e.target.value })}
                  />
                </Td>
                <Td>
                  <NumberInput
                    min={1}
                    step={1}
                    value={item.quantity}
                    aria-label="Quantity"
                    className="text-right"
                    onChange={(e) => patch(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </Td>
                <Td>
                  <TextInput
                    value={item.shipTo}
                    aria-label="Ship to"
                    onChange={(e) => patch(item.id, { shipTo: e.target.value })}
                  />
                </Td>
                <Td>
                  <TextInput
                    value={item.carrier ?? ""}
                    aria-label="Carrier"
                    onChange={(e) => patch(item.id, { carrier: e.target.value })}
                  />
                </Td>
                <Td>
                  <TextInput
                    value={item.trackingNumber ?? ""}
                    aria-label="Tracking number"
                    onChange={(e) => patch(item.id, { trackingNumber: e.target.value })}
                  />
                </Td>
                <Td>
                  <DateInput
                    value={item.shipByDate ?? ""}
                    aria-label="Ship by date"
                    onChange={(e) => patch(item.id, { shipByDate: e.target.value })}
                  />
                </Td>
                <Td>
                  <Select
                    value={item.status}
                    aria-label="Status"
                    onChange={(e) => patch(item.id, { status: e.target.value as ShippingStatus })}
                  >
                    {SHIPPING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {SHIPPING_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                  <span className="print-only hidden">
                    <Badge tone={STATUS_TONES[item.status]}>{SHIPPING_STATUS_LABELS[item.status]}</Badge>
                  </span>
                </Td>
                <Td>
                  <TextInput
                    value={item.owner ?? ""}
                    aria-label="Owner"
                    onChange={(e) => patch(item.id, { owner: e.target.value })}
                  />
                </Td>
                <Td className="no-print text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${item.item || "item"}`}
                    onClick={() =>
                      onUpdate((prev) => ({
                        ...prev,
                        shippingItems: prev.shippingItems.filter((i) => i.id !== item.id),
                      }))
                    }
                  >
                    ✕
                  </Button>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {importing ? (
        <CsvImportDialog
          onClose={() => setImporting(false)}
          onImport={(items) => {
            onUpdate((prev) => ({ ...prev, shippingItems: [...prev.shippingItems, ...items] }));
            setImporting(false);
          }}
        />
      ) : null}
    </>
  );
}
