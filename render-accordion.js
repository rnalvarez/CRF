function renderCandidateResult(r, i) {
  const relevantHits = r.hits
    .filter(h => h.tier !== "recomendado")
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.dist - b.dist);

  const warningCount = relevantHits.length;

  const tableRows = relevantHits.map(h => `
    <tr>
      <td>${fmt(h.victim)}</td>
      <td>IM${h.order}</td>
      <td>${fmt(h.product)}</td>
      <td>${fmt(h.dist)} MHz</td>
      <td>${TIER_LABEL[h.tier]}${h.inRange === false ? " <small>(fuera de rango)</small>" : ""}</td>
    </tr>
  `).join("");

  const detailSummary = warningCount
    ? `📊 Ver detalle de cálculos (${warningCount} advertencias)`
    : `✅ Ver cálculos (Limpio)`;

  const detailContent = warningCount ? `
    <table class="im-table">
      <thead><tr><th>Víctima</th><th>Orden</th><th>Producto</th><th>Distancia</th><th>Nivel</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    ${r.reasons.length ? `<div class="meta im-detail-reasons">${r.reasons.join(" · ")}</div>` : ""}
  ` : `<div class="meta">Sin producto IM relevante dentro del margen configurado.</div>`;

  return `
    <div class="result ${r.cls}">
      <div class="result-top">
        <div><span class="freq">${fmt(r.cand.freq)} MHz</span><div class="meta">${r.cand.label}</div></div>
        <div class="score">${r.tierLabel}<br><small>${Math.round(r.score)}/100</small></div>
      </div>
      <div class="bar"><span style="width:${r.score}%"></span></div>
      <div class="small-grid">
        <div class="metric"><b>${fmt(r.minSep)} MHz</b>Separación mínima</div>
        <div class="metric"><b>${r.orderCounts[2]}</b>Productos IM2</div>
        <div class="metric"><b>${r.orderCounts[3]}</b>Productos IM3</div>
        <div class="metric"><b>${r.orderCounts[4]}</b>Productos IM4</div>
        <div class="metric"><b>${r.orderCounts[5]}</b>Productos IM5</div>
      </div>
      <button type="button" class="use-btn" onclick="addCandidateAsOccupied(${r.cand.freq})">✓ Usar esta frecuencia</button>
      <details class="im-details">
        <summary>${detailSummary}</summary>
        <div class="im-details-content">${detailContent}</div>
      </details>
    </div>
  `;
}

function renderCandidateResults(results) {
  return results.length
    ? results.map(renderCandidateResult).join("")
    : "<p class='bad-text'>No hay candidatos dentro del rango y las capacidades del dispositivo.</p>";
}
