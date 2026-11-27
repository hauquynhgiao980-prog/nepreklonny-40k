/* «Непреклонный» 3.6.5 — сброс игры к началу акта I. Открывает окно подтверждения с выбором
   (оставить раздачу героев, очистить чат). Без подтверждения в окне ничего не меняется. */
export default async function ({ log }) {
  const url = `/modules/nepreklonny-40k/scripts/dela/reset.mjs?v=${Date.now()}`;
  const { resetDialog } = await import(url);
  const res = await resetDialog();
  if (!res) { log("сброс отменён"); return { ok: false }; }
  for (const l of res) log(l);
  return { ok: true, steps: res.length };
}
