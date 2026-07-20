import { Action, ActionPanel, Color, Icon, List, getPreferenceValues, openExtensionPreferences } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { loadGoldData } from "./lib/data";
import { KARATS, Karat, pricePerGramForKarat } from "./lib/gold";

interface Preferences {
  apiKey: string;
}

const WINDOW_LABEL: Record<number, string> = {
  30: "1 Month",
  90: "3 Months",
  180: "6 Months",
  365: "1 Year",
};

const sarFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "SAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatSar(value: number): string {
  return sarFormatter.format(value);
}

function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function Command() {
  const { apiKey } = getPreferenceValues<Preferences>();
  const [karat, setKarat] = useState<Karat>(24);

  const { data, isLoading, error, revalidate } = usePromise(async () => loadGoldData(apiKey), [], {
    failureToastOptions: { title: "Could not load gold prices" },
  });

  const change =
    data && data.previousClosePerTroyOunceSar ? data.latestPerTroyOunceSar - data.previousClosePerTroyOunceSar : null;
  const changePct =
    change !== null && data?.previousClosePerTroyOunceSar ? (change / data.previousClosePerTroyOunceSar) * 100 : null;
  const changeIcon = change === null ? undefined : change >= 0 ? Icon.ArrowUp : Icon.ArrowDown;
  const changeColor = change === null ? undefined : change >= 0 ? Color.Green : Color.Red;

  const sharedActions = (
    <ActionPanel>
      <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
      <Action.OpenInBrowser title="Get / Manage API Key" url="https://metals.dev/pricing" />
    </ActionPanel>
  );

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Could not load gold prices"
          description={`${error.message}\n\nCheck your metals.dev API key in preferences, then refresh.`}
          actions={sharedActions}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Karat for averages"
          value={String(karat)}
          onChange={(v) => setKarat(Number(v) as Karat)}
        >
          {KARATS.map((k) => (
            <List.Dropdown.Item key={k} title={`${k}K`} value={String(k)} />
          ))}
        </List.Dropdown>
      }
    >
      <List.Section
        title="Current Price · per gram (SAR)"
        subtitle={data ? `As of ${formatAsOf(data.asOf)}` : undefined}
      >
        {data &&
          KARATS.map((k) => {
            const perGram = pricePerGramForKarat(data.latestPerTroyOunceSar, k);
            const accessories: List.Item.Accessory[] = [{ tag: { value: formatSar(perGram), color: Color.Yellow } }];
            if (k === 24 && change !== null && changePct !== null) {
              accessories.unshift({
                icon: changeIcon ? { source: changeIcon, tintColor: changeColor } : undefined,
                text: {
                  value: `${change >= 0 ? "+" : ""}${formatSar(change)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%)`,
                  color: changeColor,
                },
                tooltip: "Change vs. previous close (24K)",
              });
            }
            return (
              <List.Item
                key={k}
                icon={{ source: Icon.Coins, tintColor: Color.Yellow }}
                title={`${k}K`}
                subtitle={k === 24 ? "Pure gold" : `${k}/24 purity`}
                accessories={accessories}
                actions={sharedActions}
              />
            );
          })}
      </List.Section>

      <List.Section
        title={`Averages · ${karat}K per gram (SAR)`}
        subtitle={data?.historyError ? "History unavailable — showing cached data" : "Based on daily closes"}
      >
        {data &&
          data.averages.map((avg) => {
            const perGram =
              avg.averagePerTroyOunceSar !== null ? pricePerGramForKarat(avg.averagePerTroyOunceSar, karat) : null;
            return (
              <List.Item
                key={avg.days}
                icon={{ source: Icon.BarChart, tintColor: Color.SecondaryText }}
                title={WINDOW_LABEL[avg.days] ?? `${avg.days} Days`}
                subtitle={
                  avg.sampleCount > 0 ? `${avg.sampleCount} day${avg.sampleCount === 1 ? "" : "s"}` : "No data yet"
                }
                accessories={[
                  {
                    tag: {
                      value: perGram !== null ? formatSar(perGram) : "—",
                      color: perGram !== null ? Color.Blue : Color.SecondaryText,
                    },
                  },
                ]}
                actions={sharedActions}
              />
            );
          })}
      </List.Section>
    </List>
  );
}
