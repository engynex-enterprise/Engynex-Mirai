#!/usr/bin/env bash
# Escaneo de vulnerabilidades bajo demanda (On-Demand Scanning) de una imagen de Artifact Registry.
# Falla si hay alguna vulnerabilidad con severidad en FAIL_SEVERITY (lista separada por comas, p. ej. CRITICAL o CRITICAL,HIGH).
# Uso: scan.sh <imagen@sha256:…> [FAIL_SEVERITY]
set -euo pipefail
IMAGE="${1:?Falta la imagen}"
FAIL="${2:-CRITICAL}"

SCAN="$(gcloud artifacts docker images scan "$IMAGE" --remote --location=us --format='value(response.scan)')"
gcloud artifacts docker images list-vulnerabilities "$SCAN" --format='value(vulnerability.effectiveSeverity)' > /workspace/severidades.txt || true

echo "Resumen de vulnerabilidades de $IMAGE:"
sort /workspace/severidades.txt | uniq -c | sort -rn || true

IFS=',' read -ra SEVS <<<"$FAIL"
for s in "${SEVS[@]}"; do
  if grep -Fxq "$s" /workspace/severidades.txt; then
    echo "La imagen tiene vulnerabilidades $s: no se despliega. Actualiza la imagen base o las dependencias."
    gcloud artifacts docker images list-vulnerabilities "$SCAN" \
      --format='table(vulnerability.effectiveSeverity, vulnerability.packageIssue[0].affectedPackage, noteName.basename())' \
      --filter="vulnerability.effectiveSeverity=$s" || true
    exit 1
  fi
done
echo "Escaneo OK (sin $FAIL)."
