---
name: "td-integration"
description: "Integración de POPs con SOP/TOP/CHOP/DAT y pipelines de render/instancing; patrones de conversión y contratos de datos."
---

# td-integration

## Objetivo

Integrar subsistemas sin conversiones innecesarias CPU↔GPU y con contratos claros de atributos/canales.

## Guías

- Evitar idas y vueltas: mantener POPs en GPU cuando el objetivo es render/compute.
- Documentar atributos esperados (p.ej. P/N/Color/PartVel/PartForce).
- Usar un nodo `null*` por frontera para inspección y debugging.

