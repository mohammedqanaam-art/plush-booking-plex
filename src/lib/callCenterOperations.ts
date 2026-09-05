import type { CallCenterForecastResult } from "./callCenterForecast";
import type { CallCenterForecastScopeMetadata } from "./callCenterForecastScope";

export type CallCenterOperationsResponse = {
  avaya: {
    reportSyncConfigured: boolean;
    agentLaunchConfigured: boolean;
    launchUrl: string | null;
    product: string;
    network: {
      mode: "off" | "observe" | "enforce";
      required: boolean;
      configured: boolean;
      detected: boolean;
      trusted: boolean;
      allowed: boolean;
      reason: string;
    };
    accessPolicy: string;
    browserPolicy: {
      desktopVoice: string;
      safari: string;
      mobile: string;
    };
  };
  forecast: CallCenterForecastResult;
  forecastScope: CallCenterForecastScopeMetadata;
};
