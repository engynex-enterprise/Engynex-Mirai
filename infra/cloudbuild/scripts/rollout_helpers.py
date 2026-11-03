#!/usr/bin/env python3
"""Ayudantes del despliegue gradual (sin dependencias: solo la biblioteca estándar).

  traffic        lee `gcloud run services describe --format=json` por stdin e imprime "rev=pct,rev=pct"
  main-revision  igual, pero imprime solo la revisión con más tráfico
  errors         consulta Cloud Monitoring: peticiones y 5xx de una revisión en los últimos N minutos → "total errores"
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request


def _traffic(doc):
    out = []
    for t in doc.get("status", {}).get("traffic", []) or []:
        pct = int(t.get("percent") or 0)
        rev = t.get("revisionName")
        if pct > 0 and rev:
            out.append((rev, pct))
    return out


def cmd_traffic(_args):
    doc = json.load(sys.stdin)
    print(",".join(f"{r}={p}" for r, p in _traffic(doc)))


def cmd_main_revision(_args):
    doc = json.load(sys.stdin)
    tr = sorted(_traffic(doc), key=lambda x: -x[1])
    print(tr[0][0] if tr else "")


def cmd_errors(args):
    token = os.environ.get("ACCESS_TOKEN", "")
    if not token:
        sys.exit("Falta ACCESS_TOKEN (gcloud auth print-access-token)")
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(minutes=args.minutes)
    flt = (
        'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" '
        f'AND resource.labels.service_name="{args.service}" AND resource.labels.revision_name="{args.revision}"'
    )
    params = {
        "filter": flt,
        "interval.startTime": start.isoformat().replace("+00:00", "Z"),
        "interval.endTime": end.isoformat().replace("+00:00", "Z"),
        "aggregation.alignmentPeriod": f"{args.minutes * 60}s",
        "aggregation.perSeriesAligner": "ALIGN_SUM",
        "aggregation.crossSeriesReducer": "REDUCE_SUM",
        "aggregation.groupByFields": "metric.label.response_code_class",
    }
    url = f"https://monitoring.googleapis.com/v3/projects/{args.project}/timeSeries?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    total = errors = 0
    for ts in data.get("timeSeries", []) or []:
        klass = ts.get("metric", {}).get("labels", {}).get("response_code_class", "")
        n = sum(int(p.get("value", {}).get("int64Value", 0)) for p in ts.get("points", []))
        total += n
        if klass == "5xx":
            errors += n
    print(f"{total} {errors}")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("traffic").set_defaults(fn=cmd_traffic)
    sub.add_parser("main-revision").set_defaults(fn=cmd_main_revision)
    e = sub.add_parser("errors")
    e.add_argument("--project", required=True)
    e.add_argument("--service", required=True)
    e.add_argument("--revision", required=True)
    e.add_argument("--minutes", type=int, default=5)
    e.set_defaults(fn=cmd_errors)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
