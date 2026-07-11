type CartonLike = {
  carton_no: string;
  created_at?: string;
};

type ParsedCartonNo = {
  raw: string;
  prefix: string;
  number: number | null;
  width: number;
  suffix: string;
};

function parseCartonNo(value: string): ParsedCartonNo {
  const raw = value.trim();
  const match = raw.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return { raw, prefix: raw, number: null, width: 0, suffix: "" };

  return {
    raw,
    prefix: match[1] ?? "",
    number: Number(match[2]),
    width: match[2]?.length ?? 0,
    suffix: match[3] ?? ""
  };
}

export function compareCartonNo(a: string, b: string) {
  const left = parseCartonNo(a);
  const right = parseCartonNo(b);

  const prefixCompare = left.prefix.localeCompare(right.prefix, "zh-Hans-CN", { numeric: true });
  if (prefixCompare !== 0) return prefixCompare;

  if (left.number !== null && right.number !== null && left.number !== right.number) {
    return left.number - right.number;
  }

  const suffixCompare = left.suffix.localeCompare(right.suffix, "zh-Hans-CN", { numeric: true });
  if (suffixCompare !== 0) return suffixCompare;

  return left.raw.localeCompare(right.raw, "zh-Hans-CN", { numeric: true });
}

export function sortByCartonNo<T extends CartonLike>(rows: T[]) {
  return rows.slice().sort((a, b) => {
    const cartonCompare = compareCartonNo(a.carton_no, b.carton_no);
    if (cartonCompare !== 0) return cartonCompare;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export function findMissingCartonNos(values: string[]) {
  const groups = new Map<string, ParsedCartonNo[]>();

  for (const value of values) {
    const parsed = parseCartonNo(value);
    if (parsed.number === null) continue;
    const key = `${parsed.prefix}|||${parsed.suffix}`;
    groups.set(key, [...(groups.get(key) ?? []), parsed]);
  }

  const missing: string[] = [];
  for (const group of groups.values()) {
    const uniqueNumbers = Array.from(new Set(group.map((item) => item.number as number))).sort((a, b) => a - b);
    if (uniqueNumbers.length < 2) continue;

    const sample = group.reduce((best, item) => (item.width > best.width ? item : best), group[0]);
    const existing = new Set(uniqueNumbers);
    for (let number = uniqueNumbers[0]; number <= uniqueNumbers[uniqueNumbers.length - 1]; number += 1) {
      if (existing.has(number)) continue;
      missing.push(`${sample.prefix}${String(number).padStart(sample.width, "0")}${sample.suffix}`);
    }
  }

  return missing.sort(compareCartonNo);
}
