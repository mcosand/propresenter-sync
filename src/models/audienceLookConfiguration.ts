import { Nullable } from "./commonTypes";

export interface AudienceLookConfiguration {
  uuid: string;
  name: string;
  screens: {
    screenUuid: string,
    propsEnabled: Nullable<boolean>,
    presentationBackgroundEnabled: Nullable<boolean>,
    presentationForegroundEnabled: Nullable<boolean>,
    announcementsEnabled: Nullable<boolean>,
    propsLayerEnabled: Nullable<boolean>,
    messagesLayerEnabled: Nullable<boolean>,
  }[];
}