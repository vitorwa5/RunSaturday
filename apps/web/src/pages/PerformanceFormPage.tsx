import {
  calendarDateIn,
  formatDateWithYear,
  formatFinishTime,
  parsePerformanceTime,
  type UserPerformance,
} from "@runsaturday/shared";
import { SearchX, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { AlertBanner } from "../components/ui/AlertBanner";
import { Button } from "../components/ui/Button";
import { ChoiceChips } from "../components/ui/ChoiceChips";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { PageHeader } from "../components/ui/PageHeader";
import {
  useDeletePerformance,
  useEvents,
  usePerformance,
  useSavePerformance,
} from "../hooks/queries";

type Field = "eventId" | "raceName" | "date" | "time";
const FIELD_FOR_CODE: Record<string, Field> = {
  unknown_event: "eventId",
  invalid_event_name: "raceName",
  invalid_date: "date",
  future_date: "date",
  invalid_time: "time",
};
/** Kept simple for now: a parkrun at a known event, or another 5K race recorded by name. */
type Kind = "parkrun" | "other";
const KIND_OPTIONS = [
  { value: "parkrun" as const, label: "parkrun" },
  { value: "other" as const, label: "Other 5K race" },
];
const TIME_HINT = "Enter a finish time like 19:35 or 1:05:30.";

const inputClass = (invalid: boolean) =>
  `min-h-11 w-full rounded-full border bg-surface px-4 text-base focus:outline-none ${invalid ? "border-problem" : "border-line focus:border-brand-700"}`;

function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 px-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 px-1 text-sm font-medium text-problem"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function PerformanceForm({
  existing,
  defaultEventId,
}: {
  existing?: UserPerformance;
  defaultEventId?: string;
}) {
  const navigate = useNavigate();
  const { data: events } = useEvents();
  const save = useSavePerformance(existing?.id);
  const auth = useAuth();
  const remove = useDeletePerformance();
  const [kind, setKind] = useState<Kind>(
    existing && existing.eventId == null ? "other" : "parkrun",
  );
  const [eventId, setEventId] = useState(
    existing?.eventId ?? defaultEventId ?? "",
  );
  const [raceName, setRaceName] = useState(existing?.externalEventName ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [time, setTime] = useState(
    existing ? formatFinishTime(existing.finishTimeSeconds) : "",
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = {
    eventId: useId(),
    raceName: useId(),
    date: useId(),
    time: useId(),
  };
  // Only a convenience for the date picker; the server enforces "not in the future".
  const today = calendarDateIn(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Quick checks for immediate feedback; the server validates everything again.
    const next: Partial<Record<Field, string>> = {};
    if (kind === "parkrun" && !eventId) next.eventId = "Choose an event.";
    if (kind === "other" && raceName.trim().length < 2)
      next.raceName = "Enter the race name.";
    if (!date) next.date = "Enter a valid date.";
    if (parsePerformanceTime(time) == null) next.time = TIME_HINT;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;
    const ticket = auth.captureOperation();
    try {
      await save.mutateAsync(
        kind === "parkrun"
          ? { eventId, performanceType: "parkrun", date, time: time.trim() }
          : {
              externalEventName: raceName.trim(),
              // Keep a road race a road race when editing; new entries are "other 5K race".
              performanceType:
                existing?.performanceType === "road_race"
                  ? "road_race"
                  : "other_race",
              date,
              time: time.trim(),
            },
      );
      if (ticket.isCurrent()) navigate("/profile", { replace: true });
    } catch (error) {
      if (!ticket.isCurrent()) return;
      const field =
        error instanceof ApiError
          ? error.code === "invalid_location"
            ? kind === "parkrun"
              ? "eventId"
              : "raceName"
            : FIELD_FOR_CODE[error.code]
          : undefined;
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
      if (field) setErrors({ [field]: message });
      else setFormError(message);
    }
  };

  const doDelete = async () => {
    if (!existing) return;
    const ticket = auth.captureOperation();
    try {
      await remove.mutateAsync(existing.id);
      if (ticket.isCurrent()) navigate("/profile", { replace: true });
    } catch (error) {
      if (!ticket.isCurrent()) return;
      setConfirmDelete(false);
      setFormError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  };

  const describedBy = (f: Field, hint = false) =>
    errors[f] ? `${ids[f]}-error` : hint ? `${ids[f]}-hint` : undefined;

  return (
    <div className="space-y-5">
      <form
        onSubmit={submit}
        noValidate
        aria-label={existing ? "Edit performance" : "Add performance"}
        className="space-y-5 rounded-3xl border border-line bg-surface p-4"
      >
        <div>
          <p className="mb-1.5 text-sm font-bold">Type</p>
          <ChoiceChips
            label="Performance type"
            options={KIND_OPTIONS}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setErrors({});
            }}
          />
        </div>
        {kind === "other" ? (
          <FormField
            id={ids.raceName}
            label="Race name"
            hint="A 5K race 5K Compass does not list, e.g. Warrington 5K"
            error={errors.raceName}
          >
            <input
              id={ids.raceName}
              autoComplete="off"
              maxLength={100}
              placeholder="Warrington 5K"
              value={raceName}
              onChange={(e) => setRaceName(e.target.value)}
              aria-invalid={errors.raceName != null}
              aria-describedby={describedBy("raceName", true)}
              className={inputClass(errors.raceName != null)}
            />
          </FormField>
        ) : (
          <FormField id={ids.eventId} label="Event" error={errors.eventId}>
            <select
              id={ids.eventId}
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              aria-invalid={errors.eventId != null}
              aria-describedby={describedBy("eventId")}
              className={inputClass(errors.eventId != null)}
            >
              <option value="">Choose an event</option>
              {existing?.eventId && events && !events.some((ev) => ev.id === existing.eventId) && (
                <option value={existing.eventId}>{existing.eventName} (not in active catalogue)</option>
              )}
              {events?.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField id={ids.date} label="Date" error={errors.date}>
          <input
            id={ids.date}
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={errors.date != null}
            aria-describedby={describedBy("date")}
            className={inputClass(errors.date != null)}
          />
        </FormField>
        <FormField
          id={ids.time}
          label="Finish time"
          hint="MM:SS or HH:MM:SS, e.g. 19:35 or 1:05:30"
          error={errors.time}
        >
          <input
            id={ids.time}
            inputMode="text"
            autoComplete="off"
            placeholder="19:35"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-invalid={errors.time != null}
            aria-describedby={describedBy("time", true)}
            className={`${inputClass(errors.time != null)} tabular-nums`}
          />
        </FormField>
        {formError && (
          <AlertBanner tone="problem" title="Not saved">
            {formError}
          </AlertBanner>
        )}
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending
            ? "Saving…"
            : existing
              ? "Save changes"
              : "Add performance"}
        </Button>
        <p className="text-xs text-subtle">
          Saved as a manual 5K entry. Manual entries are not verified results.
          {kind === "other" &&
            " Races at courses 5K Compass does not model count towards your 5K PB but cannot be course-adjusted."}
        </p>
      </form>

      {existing && (
        <section
          aria-label="Delete performance"
          className="rounded-3xl border border-line bg-surface p-4"
        >
          {confirmDelete ? (
            <div
              role="alertdialog"
              aria-labelledby="delete-title"
              aria-describedby="delete-desc"
              className="space-y-3"
            >
              <h2 id="delete-title" className="text-base font-bold">
                Delete this performance?
              </h2>
              <p id="delete-desc" className="text-sm text-muted">
                {existing.eventName} ·{" "}
                {formatFinishTime(existing.finishTimeSeconds)} ·{" "}
                {formatDateWithYear(existing.date)}. This can't be undone, and
                your PBs will be recalculated.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-problem hover:bg-problem"
                  onClick={doDelete}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="w-full text-problem"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete performance
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

/** /profile/performances/new (optionally ?event=<id>) and /profile/performances/:id/edit. */
export function PerformanceFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, isPending, isError, error, refetch } = usePerformance(id);

  if (!id) {
    return (
      <div className="space-y-4">
        <PageHeader
          back
          title="Add performance"
          subtitle="Record a 5K you have run."
        />
        <PerformanceForm defaultEventId={params.get("event") ?? undefined} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader back title="Edit performance" />
      {isPending ? (
        <LoadingState variant="card" label="Loading performance" />
      ) : isError ? (
        error instanceof ApiError && error.status === 404 ? (
          <EmptyState
            icon={SearchX}
            title="Performance not found"
            description="It may already have been deleted."
          />
        ) : (
          <ErrorState
            error={error}
            title="Performance could not be loaded"
            onRetry={() => refetch()}
          />
        )
      ) : data.editable ? (
        <PerformanceForm existing={data} />
      ) : (
        <AlertBanner tone="info" title="Imported performance">
          Performances imported from another source can't be edited here.
        </AlertBanner>
      )}
    </div>
  );
}
