"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteCircuit,
  listCircuits,
  saveCircuit,
  MAX_CIRCUIT_NAME,
  MAX_SAVED_CIRCUITS,
  type SavedCircuit,
} from "@/lib/circuit-store";
import { subscribe } from "@/lib/progress-store";
import { Panel } from "@/components/workspace/panel";
import { benchButtonClass, benchFieldClass } from "./controls";

/**
 * The shelf: named circuits in localStorage under qc:circuit:* (so they ride the
 * existing sync snapshot). The list refreshes through the progress-store
 * subscription — the same channel the store's save/delete dispatch on — so a
 * save in another tab shows up here too. Delete is an inline two-step confirm
 * (Delete -> "Confirm?"), never window.confirm, which would block the tab.
 */

const CONFIRM_MS = 3000;

export function SavedPanel({
  source,
  theta,
  name,
  onNameChange,
  editing,
  onLoad,
  onSaved,
  onDeleted,
}: {
  source: string;
  /** The bench's live slider angle — saved with the source so a Load restores it. */
  theta: number;
  name: string;
  onNameChange: (v: string) => void;
  /** The loaded circuit this bench is editing — Save updates it in place. */
  editing: { id: string; name: string } | null;
  onLoad: (c: SavedCircuit) => void;
  onSaved: (c: SavedCircuit) => void;
  onDeleted: (id: string) => void;
}) {
  const [circuits, setCircuits] = useState<SavedCircuit[]>([]);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => setCircuits(listCircuits());
    refresh();
    return subscribe(refresh);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const handleSave = () => {
    // An empty field while editing means "keep the name" — Save is the update.
    const effectiveName = name.trim() || editing?.name || "";
    const res = saveCircuit({ id: editing?.id, name: effectiveName, src: source, theta });
    if (res.ok) {
      onSaved(res.circuit);
      onNameChange("");
      setStatusIsError(false);
      setStatus(`Saved "${res.circuit.name}"`);
    } else {
      setStatusIsError(true);
      setStatus(res.error);
    }
  };

  const handleDelete = (id: string) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingId(null), CONFIRM_MS);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingId(null);
    deleteCircuit(id);
    onDeleted(id);
  };

  const atCap = circuits.length >= MAX_SAVED_CIRCUITS;

  return (
    <Panel
      title="Saved circuits"
      id="saved"
      sub={circuits.length > 0 ? `${circuits.length}/${MAX_SAVED_CIRCUITS}` : undefined}
    >
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={MAX_CIRCUIT_NAME}
          aria-label="Circuit name"
          placeholder="Name this circuit"
          className={`${benchFieldClass} min-w-0 flex-1 px-3 py-1.5 text-sm`}
        />
        <button type="button" onClick={handleSave} className={benchButtonClass}>
          Save
        </button>
      </div>

      {editing && (
        <p className="mt-1.5 text-xs text-caption">
          editing <span className="font-medium">{editing.name}</span> — Save updates it
        </p>
      )}

      <p
        role="status"
        className={`mt-1.5 min-h-4 text-xs ${
          statusIsError ? "text-danger-dark dark:text-danger-light" : "text-caption"
        }`}
      >
        {status}
      </p>

      {circuits.length === 0 ? (
        <p className="mt-2 text-sm text-caption">
          Nothing saved yet — name a circuit above to keep it on this device.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {circuits.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {c.name}
                </p>
                <p className="text-xs text-caption">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLoad(c)}
                aria-label={`Load ${c.name}`}
                className={benchButtonClass}
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                aria-label={
                  confirmingId === c.id ? `Confirm delete ${c.name}` : `Delete ${c.name}`
                }
                className={`rounded-control border px-2.5 py-1 text-xs font-medium interactive focus-ring ${
                  confirmingId === c.id
                    ? "border-danger/40 bg-danger/10 text-danger-dark dark:text-danger-light"
                    : "border-gray-200 bg-gray-50 text-danger-dark hover:bg-danger/10 dark:border-gray-700/50 dark:bg-gray-900/50 dark:text-danger-light"
                }`}
              >
                {confirmingId === c.id ? "Confirm?" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {atCap && (
        <p className="mt-3 text-xs text-caption">
          Save limit reached ({MAX_SAVED_CIRCUITS}) — delete a circuit to make room.
        </p>
      )}
    </Panel>
  );
}
