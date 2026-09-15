"use client";

import { Panel } from "@moj/ui";
import { Component, type ReactNode } from "react";

/**
 * A Convex subscription that is refused throws while the panel renders, which
 * would otherwise take the whole page down. Some refusals are expected — DMOJ
 * lets only an organisation's own admins read its join requests, whatever else
 * the viewer may do — so the panel that asked says so and the rest of the page
 * keeps working.
 */
export class QueryBoundary extends Component<
  { title: string; message: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Panel title={this.props.title} bodyClassName="p-3">
          <p className="text-sm text-muted-foreground">{this.props.message}</p>
        </Panel>
      );
    }
    return this.props.children;
  }
}
