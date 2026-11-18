import { appendFile, mkdir, open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const callMarker = '<!-- FW-038 real model call -->';

export async function readFw038CallCount(reportPath: string) {
  let report = '';
  try {
    report = await readFile(reportPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const recordedCalls = report.split(callMarker).length - 1;
  let reservedCalls = 0;
  const claimPrefix = `${path.basename(reportPath)}.call-`;
  let files: string[];
  try {
    files = await readdir(path.dirname(reportPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return recordedCalls;
    throw error;
  }
  for (const file of files) {
    if (!file.startsWith(claimPrefix) || !file.endsWith('.claim')) continue;
    const callNumber = Number(file.slice(claimPrefix.length, -'.claim'.length));
    if (Number.isInteger(callNumber))
      reservedCalls = Math.max(reservedCalls, callNumber);
  }
  return Math.max(recordedCalls, reservedCalls);
}

export async function reserveFw038Call(reportPath: string) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  const previousCalls = await readFw038CallCount(reportPath);
  for (let callNumber = previousCalls + 1; callNumber <= 30; callNumber += 1) {
    const reservationPath = `${reportPath}.call-${String(callNumber).padStart(2, '0')}.claim`;
    try {
      const reservation = await open(reservationPath, 'wx');
      await reservation.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    await appendFile(reportPath, `${callMarker}\n`);
    return callNumber;
  }
  throw new Error('FW-038 已达到 30 次真实模型请求上限。');
}

export async function reserveConfiguredFw038Call() {
  const reportPath = process.env.FW_AI_CALL_BUDGET_FILE?.trim();
  if (!reportPath) return undefined;
  return reserveFw038Call(reportPath);
}
