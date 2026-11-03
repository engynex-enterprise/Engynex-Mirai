#!/usr/bin/env python3
"""Prueba de contrato del Terraform de Mirai (docs/infra/cambiar-de-nube.md).

Revisa, sin nube ni proveedores, que cambiar de nube sea cambiar de raíz y no de diseño:
  1. capabilities/<capacidad>/{gcp,aws,azure}/variables.tf son idénticos (mismas entradas, mismos tipos).
  2. Cada implementación declara exactamente las salidas del contrato (SALIDAS).
  3. clouds/<nube>/stack/variables-comunes.tf es idéntico en las tres nubes y outputs-comunes.tf declara las mismas
     salidas.
  4. Cada nube tiene sus raíces clouds/<nube>/envs/{bootstrap,pruebas,produccion}.

Uso: python3 infra/terraform/scripts/contrato.py   (sale con 1 si algo no cumple)
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
NUBES = ("gcp", "aws", "azure")
AMBIENTES = ("bootstrap", "pruebas", "produccion")

# Salidas obligatorias de cada capacidad (iguales en las tres nubes). Los "handles" son opacos (forma propia de cada nube).
SALIDAS: dict[str, set[str]] = {
    "network": {"network", "id", "nat_ips"},
    "container-platform": {"platform", "id", "internal_domain"},
    "identity": {"handles", "principals", "ids"},
    "container-service": {"service_id", "name", "internal_url", "public_url", "edge_origin"},
    "postgres": {"instance_id", "host", "port", "database", "connection_name", "connection_urls", "admin_url", "iam_users"},
    "redis": {"id", "host", "port", "url"},
    "object-storage": {"bucket_names", "bucket_ids", "public_origin", "endpoints"},
    "queue": {"driver", "queue_names", "queue_ids", "env"},
    "scheduler": {"job_ids"},
    "secrets": {"refs", "ids"},
    "registry": {"registry_url", "id", "name"},
    "edge": {"id", "ip_or_cname", "dns_records", "security_policy_id"},
    "dns": {"zone_id", "name_servers"},
    "monitoring": {"notification_channel_ids", "uptime_check_ids"},
    "budget": {"id"},
    "ci-identity": {"provider_id", "principals", "ids"},
}

RE_OUTPUT = re.compile(r'^\s*output\s+"([A-Za-z0-9_-]+)"', re.M)
RE_VARIABLE = re.compile(r'^\s*variable\s+"([A-Za-z0-9_-]+)"', re.M)


def nombres(carpeta: Path, patron: re.Pattern[str], archivos: str = "*.tf") -> set[str]:
    out: set[str] = set()
    for f in sorted(carpeta.glob(archivos)):
        out.update(patron.findall(f.read_text(encoding="utf-8")))
    return out


def huella(f: Path) -> str:
    return hashlib.sha256(f.read_bytes()).hexdigest()


def main() -> int:
    errores: list[str] = []
    caps = RAIZ / "capabilities"

    encontradas = sorted(p.name for p in caps.iterdir() if p.is_dir() and (p / "gcp").is_dir())
    faltan = set(SALIDAS) - set(encontradas)
    sobran = set(encontradas) - set(SALIDAS)
    if faltan:
        errores.append(f"Faltan capacidades: {sorted(faltan)}")
    if sobran:
        errores.append(f"Capacidades sin contrato en SALIDAS: {sorted(sobran)}")

    for cap in sorted(set(encontradas) & set(SALIDAS)):
        huellas = {}
        for nube in NUBES:
            impl = caps / cap / nube
            var = impl / "variables.tf"
            if not var.is_file():
                errores.append(f"{cap}/{nube}: falta variables.tf")
                continue
            huellas[nube] = huella(var)
            if not (impl / "main.tf").is_file():
                errores.append(f"{cap}/{nube}: falta main.tf")
            salidas = nombres(impl, RE_OUTPUT)
            if salidas != SALIDAS[cap]:
                errores.append(
                    f"{cap}/{nube}: salidas distintas del contrato (faltan {sorted(SALIDAS[cap] - salidas)}, sobran {sorted(salidas - SALIDAS[cap])})"
                )
            # Las variables solo pueden vivir en variables.tf (el contrato).
            otras = {f.name for f in impl.glob("*.tf") if f.name != "variables.tf" and RE_VARIABLE.search(f.read_text(encoding="utf-8"))}
            if otras:
                errores.append(f"{cap}/{nube}: declara variables fuera de variables.tf ({sorted(otras)})")
        if len(set(huellas.values())) > 1:
            errores.append(f"{cap}: variables.tf no es idéntico en {sorted(huellas)} (el contrato debe ser el mismo)")

    # Stacks por nube: variables y salidas comunes.
    stacks = {n: RAIZ / "clouds" / n / "stack" for n in NUBES}
    comunes = {n: s / "variables-comunes.tf" for n, s in stacks.items()}
    if all(f.is_file() for f in comunes.values()):
        if len({huella(f) for f in comunes.values()}) > 1:
            errores.append("clouds/*/stack/variables-comunes.tf no es idéntico en las tres nubes")
    else:
        errores.append(f"Falta variables-comunes.tf en: {[n for n, f in comunes.items() if not f.is_file()]}")
    salidas_stack = {n: nombres(s, RE_OUTPUT, "outputs-comunes.tf") for n, s in stacks.items()}
    if len({frozenset(v) for v in salidas_stack.values()}) > 1:
        ref = salidas_stack["gcp"]
        for n, v in salidas_stack.items():
            if v != ref:
                errores.append(f"clouds/{n}/stack/outputs-comunes.tf: faltan {sorted(ref - v)}, sobran {sorted(v - ref)} (frente a gcp)")

    for nube in NUBES:
        for amb in AMBIENTES:
            raiz = RAIZ / "clouds" / nube / "envs" / amb
            if not (raiz / "main.tf").is_file():
                errores.append(f"Falta la raíz clouds/{nube}/envs/{amb}")

    if errores:
        print("Contrato de Terraform: NO cumple")
        for e in errores:
            print(f"  - {e}")
        return 1
    print(f"Contrato de Terraform: OK ({len(SALIDAS)} capacidades × {len(NUBES)} nubes, stacks y raíces)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
