export type ScreenshotAttachmentStep = {
  readonly messages: readonly [
    {
      readonly role: "user";
      readonly content: readonly [
        { readonly type: "text"; readonly text: string },
        { readonly type: "image"; readonly image: string },
      ];
    },
  ];
};

export function shouldAttachLatestScreenshot(
  latestPng: string | null,
  stepNumber: number,
): latestPng is string {
  return latestPng !== null && stepNumber >= 2;
}

export function buildScreenshotAttachmentStep(pngBase64: string): ScreenshotAttachmentStep {
  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Attached: latest primary-display PNG for visual reasoning.",
          },
          {
            type: "image",
            image: `data:image/png;base64,${pngBase64}`,
          },
        ],
      },
    ],
  };
}
