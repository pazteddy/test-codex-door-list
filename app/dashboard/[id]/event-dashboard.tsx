"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDailyRegistrationDate,
  formatEventDate,
  formatOrganizerEventDate,
} from "@/lib/dates";
import { getOrganizerEventDashboard } from "@/lib/organizer-dashboard";
import { supabase } from "@/lib/supabase/client";
import type {
  DailyRegistrationCount,
  DailyRegistrationsResponse,
  OrganizerEventDashboard,
} from "@/lib/types";
import { useOrganizerSession } from "../dashboard-auth";

type ChartState =
  | { status: "loading"; data: null }
  | { status: "error"; data: null }
  | { status: "ready"; data: DailyRegistrationsResponse };

function RegistrationsChart({
  state,
  onRetry,
}: {
  state: ChartState;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="chart-panel chart-loading" aria-busy="true">
        <p className="visually-hidden" role="status">Cargando registros por día…</p>
        <div className="chart-skeleton" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <span className="skeleton" key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="data-state compact-state">
        <p className="alert alert-error" role="alert">
          No pudimos cargar los registros por día. Intenta nuevamente.
        </p>
        <button className="button button-primary" type="button" onClick={onRetry}>
          Intentar nuevamente
        </button>
      </div>
    );
  }

  if (!state.data.publishedAt) {
    return (
      <div className="data-state compact-state">
        <h3>El evento aún no fue publicado</h3>
        <p>La actividad diaria aparecerá aquí después de publicar el evento.</p>
      </div>
    );
  }

  const points = state.data.registrationsByDay;
  const maxCount = Math.max(...points.map((point) => point.count), 1);

  return (
    <figure className="chart-panel">
      <div
        className="daily-chart"
        role="img"
        aria-label={`Registros diarios desde la publicación. Máximo: ${maxCount} registros en un día.`}
      >
        <ol className="chart-bars" aria-hidden="true">
          {points.map((point) => (
            <li className="chart-bar" key={point.date}>
              <span className="chart-value">{point.count}</span>
              <span className="chart-bar-track">
                <span
                  className="chart-bar-fill"
                  style={{ height: `${(point.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="chart-label">{formatDailyRegistrationDate(point.date)}</span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption>
        Cada barra muestra los registros completados durante ese día.
      </figcaption>
      <table className="visually-hidden">
        <caption>Detalle de registros por día</caption>
        <thead><tr><th scope="col">Fecha</th><th scope="col">Registros</th></tr></thead>
        <tbody>
          {points.map((point: DailyRegistrationCount) => (
            <tr key={point.date}>
              <td>{formatDailyRegistrationDate(point.date)}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default function EventDashboard({ eventId }: { eventId: string }) {
  const session = useOrganizerSession();
  const [dashboard, setDashboard] = useState<OrganizerEventDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "loading" | "error">("idle");
  const [chartState, setChartState] = useState<ChartState>({ status: "loading", data: null });

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const result = await getOrganizerEventDashboard(supabase, session.user.id, eventId);
      setDashboard(result);
      setNotFound(!result);
    } catch {
      setError("No pudimos cargar el detalle del evento. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [eventId, session.user.id]);

  const loadDailyRegistrations = useCallback(async () => {
    setChartState({ status: "loading", data: null });

    try {
      const response = await fetch(`/api/eventos/${eventId}/registros-por-dia`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        setChartState({ status: "error", data: null });
        return;
      }

      const data = (await response.json()) as DailyRegistrationsResponse;
      setChartState({ status: "ready", data });
    } catch {
      setChartState({ status: "error", data: null });
    }
  }, [eventId, session.access_token]);

  const downloadAttendees = useCallback(async () => {
    setExportState("loading");
    try {
      const response = await fetch(`/api/eventos/${eventId}/asistentes`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        setExportState("error");
        return;
      }

      const contentDisposition = response.headers.get("content-disposition");
      const fileName = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? "asistentes.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setExportState("idle");
    } catch {
      setExportState("error");
    }
  }, [eventId, session.access_token]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  useEffect(() => {
    void Promise.resolve().then(loadDailyRegistrations);
  }, [loadDailyRegistrations]);

  const totalRegistrations = useMemo(
    () => dashboard?.ticketTypes.reduce((total, ticketType) => total + ticketType.registrationCount, 0) ?? 0,
    [dashboard],
  );

  if (loading) {
    return (
      <main className="page-shell dashboard-page" aria-busy="true">
        <p className="visually-hidden" role="status">Cargando evento…</p>
        <header className="page-header" aria-hidden="true">
          <div>
            <span className="skeleton skeleton-compact" />
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-secondary" />
          </div>
        </header>
        <section className="data-section" aria-hidden="true">
          <span className="skeleton skeleton-section-title" />
          <div className="capacity-grid">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="metric-card" key={index}>
                <span className="skeleton skeleton-title" />
                <span className="skeleton skeleton-secondary" />
              </div>
            ))}
          </div>
        </section>
        <section className="data-section" aria-hidden="true">
          <span className="skeleton skeleton-section-title" />
          <div className="chart-panel chart-loading">
            <div className="chart-skeleton">
              {Array.from({ length: 7 }, (_, index) => (
                <span className="skeleton" key={index} />
              ))}
            </div>
          </div>
        </section>
        <section className="data-section" aria-hidden="true">
          <span className="skeleton skeleton-section-title" />
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th scope="col">Asistente</th><th scope="col">Tipo de entrada</th><th scope="col">Registro</th></tr></thead>
              <tbody>
                {Array.from({ length: 5 }, (_, index) => (
                  <tr key={index}>
                    <td><span className="skeleton skeleton-primary" /></td>
                    <td><span className="skeleton skeleton-compact" /></td>
                    <td><span className="skeleton skeleton-secondary" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  }
  if (error) {
    return (
      <main className="page-shell state-page">
        <div className="data-state">
          <p className="alert alert-error" role="alert">{error}</p>
          <button className="button button-primary" type="button" onClick={() => void loadDashboard()}>Intentar nuevamente</button>
        </div>
      </main>
    );
  }
  if (notFound || !dashboard) {
    return (
      <main className="page-shell state-page">
        <div className="data-state">
          <h1>Evento no disponible</h1>
          <p>No encontramos este evento entre tus eventos.</p>
          <Link className="button button-secondary" href="/dashboard">Volver a mis eventos</Link>
        </div>
      </main>
    );
  }

  const hasAttendees = dashboard.registrations.length > 0;

  return (
    <main className="page-shell dashboard-page">
      <header className="page-header detail-header">
        <div>
          <Link className="back-link" href="/dashboard">← Mis eventos</Link>
          <div className="heading-meta">
            <span className={`status-badge status-${dashboard.event.status}`}>{dashboard.event.status === "published" ? "Publicado" : "Borrador"}</span>
            <span>{formatEventDate(dashboard.event.eventDate)}</span>
          </div>
          <h1>{dashboard.event.title}</h1>
          <p className="page-description">{dashboard.event.venue}</p>
        </div>
        <div className="summary-card">
          <strong>{totalRegistrations}</strong>
          <span>registros totales</span>
        </div>
      </header>

      <section className="data-section" aria-labelledby="ticket-types-heading">
        <div className="section-heading">
          <h2 id="ticket-types-heading">Tipos de entrada</h2>
          <span>{dashboard.ticketTypes.length} tipos</span>
        </div>
        {dashboard.ticketTypes.length === 0 ? (
          <div className="data-state compact-state">
            <h2>Este evento no tiene tipos de entrada</h2>
            <p>Los tipos de entrada aparecerán aquí cuando los configures.</p>
          </div>
        ) : (
          <div className="capacity-grid">
            {dashboard.ticketTypes.map((ticketType) => {
              const percentage = ticketType.maxCapacity === null
                ? null
                : Math.min((ticketType.registrationCount / ticketType.maxCapacity) * 100, 100);
              return (
                <article className="metric-card" key={ticketType.id}>
                  <div className="metric-card-heading">
                    <h3>{ticketType.name}</h3>
                    <strong>
                      {ticketType.maxCapacity === null
                        ? `${ticketType.registrationCount} / sin límite`
                        : `${ticketType.registrationCount} / ${ticketType.maxCapacity}`}
                    </strong>
                  </div>
                  {percentage === null ? null : (
                    <div className="capacity-track" aria-label={`${ticketType.registrationCount} de ${ticketType.maxCapacity} entradas vendidas`}>
                      <span style={{ width: `${percentage}%` }} />
                    </div>
                  )}
                  <p>
                    {ticketType.maxCapacity === null
                      ? "Sin límite de entradas"
                      : `${Math.max(ticketType.maxCapacity - ticketType.registrationCount, 0)} lugares disponibles`}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="data-section" aria-labelledby="registrations-chart-heading">
        <div className="section-heading">
          <div>
            <h2 id="registrations-chart-heading">Registros por día</h2>
            <p>Actividad diaria desde que el evento se publicó.</p>
          </div>
        </div>
        <RegistrationsChart state={chartState} onRetry={() => void loadDailyRegistrations()} />
      </section>

      <section className="data-section" aria-labelledby="attendees-heading">
        <div className="section-heading">
          <h2 id="attendees-heading">Asistentes registrados</h2>
          <div className="section-heading-actions">
            <span>{dashboard.registrations.length} personas</span>
            {hasAttendees ? (
              <button
                className="button button-secondary"
                type="button"
                disabled={exportState === "loading"}
                aria-busy={exportState === "loading"}
                onClick={() => void downloadAttendees()}
              >
                {exportState === "loading" ? "Descargando…" : "Descargar CSV"}
              </button>
            ) : null}
          </div>
        </div>
        {hasAttendees && exportState === "error" ? (
          <p className="alert alert-error" role="alert">
            No pudimos descargar los asistentes. Intenta nuevamente.
          </p>
        ) : null}
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Personas registradas y su tipo de entrada</caption>
            <thead><tr><th scope="col">Asistente</th><th scope="col">Tipo de entrada</th><th scope="col">Registro</th></tr></thead>
            <tbody>
              {!hasAttendees ? (
                <tr>
                  <td colSpan={3}>
                    <div className="table-state">
                      <strong>Todavía no hay asistentes registrados</strong>
                      <p>Las personas aparecerán aquí cuando completen su registro.</p>
                    </div>
                  </td>
                </tr>
              ) : dashboard.registrations.map((registration) => (
                  <tr key={registration.id}>
                    <td><strong>{registration.attendeeName}</strong><span>{registration.attendeeEmail}</span></td>
                    <td><span className="status-badge status-neutral">{registration.ticketType.name}</span></td>
                    <td>{formatOrganizerEventDate(registration.registeredAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
