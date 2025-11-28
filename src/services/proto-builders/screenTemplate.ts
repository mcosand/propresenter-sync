import * as proto from '@/models/propresenter-proto';

export function buildProPresenterScreen(config: { uuid: string, name: string, type: proto.rv.data.ProPresenterScreen.ScreenType, width: number, height: number }): proto.rv.data.ProPresenterScreen {
  return proto.rv.data.ProPresenterScreen.fromObject({
      name: config.name,
      screenType: config.type,
      arrangementSingle: {
        screens: [
          {
            uuid: {
              string: config.uuid,
            },
            name: "Placholder - " + config.name,
            color: {
              red: 0.666700005531311,
              green: 0.666700005531311,
              blue: 0.666700005531311,
              alpha: 1
            },
            bounds: {
              origin: {},
              size: {
                width: config.width,
                height: config.height
              }
            },
            subscreenUnitRect: {
              origin: {},
              size: {
                width: 1,
                height: 1
              }
            },
            cornerValues: {
              topLeft: {},
              topRight: {},
              bottomLeft: {},
              bottomRight: {}
            },
            outputDisplay: {
              name: "Placeholder - " + config.name,
              deviceName: "Placeholder - " + config.name,
              type: proto.rv.data.OutputDisplay.Type.TYPE_CUSTOM,
              mode: {
                name: config.height + "p0",
                width: config.width,
                height: config.height
              },
              renderId: "placeholder:" + crypto.randomUUID()
            },
            colorAdjustment: {},
            alphaSettings: {
              mode: proto.rv.data.Screen.AlphaSettings.Mode.MODE_DISABLED
            }
          }
        ]
      },
      backgroundColor: {
        alpha: 1
      },
      uuid: {
        string: crypto.randomUUID()
      }
    });
  }