/**
 * Ask for a specific useful photograph — never a generic "more photos".
 */

import type { CropHealthPhotoView } from "./crop-health-state";
import type { KnownFarmerFacts } from "./tomato-protocol";

export type PhotoRequest = {
  view: CropHealthPhotoView;
  farmerQuestion: string;
};

export function specificPhotoRequest(options: {
  facts: Pick<
    KnownFarmerFacts,
    "rawText" | "suspectedIssue" | "distributionHint" | "suddenWilt"
  >;
  hasPhotos?: boolean;
  alreadyRequested?: boolean;
  previousView?: CropHealthPhotoView | null;
}): PhotoRequest | null {
  const text = options.facts.rawText.toLowerCase();
  const issue = (options.facts.suspectedIssue ?? "").toLowerCase();
  const previous = options.previousView ?? null;

  const pick = (view: CropHealthPhotoView, question: string): PhotoRequest | null => {
    if (previous === view) return null;
    if (options.alreadyRequested && previous && previous === view) return null;
    return { view, farmerQuestion: question };
  };

  if (options.facts.suddenWilt || issue === "wilt" || /\bwilt/.test(text)) {
    if (previous === "stem_lesion") {
      return pick("roots", "Can you send a photo of the roots of a wilted plant?");
    }
    return pick(
      "stem_lesion",
      "Can you send a photo of a wilted plant with a stem cut open lengthwise?",
    );
  }

  if (/\b(fruit|tomato blight on fruit|rot(ting)? fruit|blossom)\b/.test(text)) {
    return pick(
      "cut_fruit",
      "Can you send a photo of a cut fruit showing the inside of the damage?",
    );
  }

  if (
    issue === "whiteflies" ||
    issue === "leaf holes" ||
    /\b(white\s*fl|aphid|thrips|mite|underside|sticky|sooty)\b/.test(text)
  ) {
    return pick(
      "underside_of_leaf",
      "Can you send a close photo of the underside of an affected leaf?",
    );
  }

  if (
    issue === "foliar fungal disease" ||
    /\b(spots?|lesion|blight|mildew|mould|mold|cercospora|anthracnose)\b/.test(text)
  ) {
    if (previous === "affected_leaf_front") {
      return pick(
        "underside_of_leaf",
        "Can you send a close photo of the underside of that same leaf?",
      );
    }
    return pick(
      "affected_leaf_front",
      "Can you send a close photo of the front of an affected leaf, including any spots?",
    );
  }

  if (options.facts.distributionHint === "patches" || /\bpatches?\b/.test(text)) {
    return pick(
      "field_pattern",
      "Can you send a photo that shows how the problem is spread across the field or beds?",
    );
  }

  if (/\b(root|waterlog|pulls? up easy|stem base)\b/.test(text)) {
    return pick(
      "roots",
      "Can you send a photo of the roots and the stem base of an affected plant?",
    );
  }

  if (options.hasPhotos && !previous) {
    return pick(
      "whole_plant",
      "Can you send a photo of the whole plant so I can see how far the damage has gone?",
    );
  }

  if (options.alreadyRequested) {
    return pick(
      "whole_plant",
      "A photo of the whole plant, not just the damaged leaf, would help next.",
    );
  }

  return pick(
    "whole_plant",
    "Can you send a close photo of the damaged leaf plus a whole plant?",
  );
}

export function isGenericPhotoAsk(text: string): boolean {
  return (
    /\b(more photos?|another photo|additional photos?|upload (some )?photos?|send (some )?photos?)\b/i.test(
      text,
    ) && !/\b(underside|whole plant|roots?|stem|cut fruit|field|beds?|lesion)\b/i.test(text)
  );
}
