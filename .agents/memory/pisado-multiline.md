---
name: Pisado multi-línea
description: Comportamiento correcto del número pisado cuando el jugador forma múltiples líneas en modos vertical/horizontal/quina/diagonal.
---

## Regla
Si un jugador fue "pisado" en una línea (ej. columna B) y el admin canta un bolillo que completa una NUEVA línea independiente (ej. columna I con I16), el reclamo debe ser válido — no pisado.

## Por qué existía el bug
`validateBingo` devuelve `true` si CUALQUIER línea está completa. El chequeo de pisado usaba `validateBingo(prevNumbers)` — como la columna B seguía completa en todos los bolillos posteriores, siempre devolvía `true` → falso pisado.

## Fix implementado
Nueva función `countValidLines` que cuenta líneas ganadoras independientes por modo. El pisado ahora se dispara solo si `linesNow <= linesBefore` (el último bolillo no aumentó el conteo de líneas).

**Why:** Un jugador puede perder una línea por pisado y legítimamente ganar con una línea nueva completada por el siguiente bolillo que la cierra.

**How to apply:** Aplica a modos `horizontal`, `vertical`, `diagonal`, `quina`. Los modos de resultado único (`full_card`, `esquinas`, `cruz`, `x_doble`) usan `validateBingo` internamente (0 o 1).
