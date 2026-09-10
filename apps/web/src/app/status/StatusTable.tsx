"use client";

import { EmptyRow, Table } from "@moj/ui";

type JudgeRow = {
  name: string;
  online: boolean;
  ping?: number;
  load?: number;
  runtimes: string;
};

export function StatusTable() {
  const judges: JudgeRow[] = [];

  return (
    <Table>
      <thead>
        <tr>
          <th>Judge</th>
          <th>Status</th>
          <th>Ping</th>
          <th>Load</th>
          <th>Runtimes</th>
        </tr>
      </thead>
      <tbody>
        {judges.length === 0 ? (
          <EmptyRow colSpan={5}>No judges are online.</EmptyRow>
        ) : (
          judges.map((judge) => (
            <tr key={judge.name}>
              <td>{judge.name}</td>
              <td>{judge.online ? "Online" : "Offline"}</td>
              <td>{judge.ping !== undefined ? `${judge.ping.toFixed(0)} ms` : "—"}</td>
              <td>{judge.load !== undefined ? judge.load.toFixed(2) : "—"}</td>
              <td>{judge.runtimes}</td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
