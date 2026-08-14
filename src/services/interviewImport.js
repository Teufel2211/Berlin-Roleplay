function parseNumber(value) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseGradingSheet(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const questions = [];
  let section = 1;
  let sectionTitle = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = /^Abschnitt\s+(\d+)\s*[-–—:]?\s*(.*)$/i.exec(line);
    if (sectionMatch) {
      section = Number(sectionMatch[1]);
      sectionTitle = sectionMatch[2].trim();
      continue;
    }

    const match = /^(\d+)\.\s*(.*?)\s*`\s*([0-9]+(?:[,.][0-9]+)?)\s*\/\s*([0-9]+(?:[,.][0-9]+)?)\s*P\s*`\s*$/i.exec(line);
    if (!match) continue;

    const number = Number(match[1]);
    const frage = match[2].trim();
    const score = parseNumber(match[3]);
    const maxPoints = parseNumber(match[4]);
    if (!frage || score === null || maxPoints === null || maxPoints < 0 || score < 0 || score > maxPoints) continue;

    questions.push({ number, section, sectionTitle, frage, score, maxPoints });
  }

  return questions;
}

module.exports = { parseGradingSheet };
