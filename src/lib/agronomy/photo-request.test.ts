import { describe, expect, it } from "vitest";
import { isGenericPhotoAsk, specificPhotoRequest } from "./photo-request";
import { extractKnownFacts } from "./tomato-protocol";

describe("specific photo requests", () => {
  it("asks for a cut stem on wilt, not more photos", () => {
    const facts = extractKnownFacts("My cucumber plants in Couva are wilting suddenly");
    const request = specificPhotoRequest({ facts });
    expect(request?.view).toBe("stem_lesion");
    expect(request?.farmerQuestion.toLowerCase()).toMatch(/stem/);
    expect(isGenericPhotoAsk(request!.farmerQuestion)).toBe(false);
  });

  it("asks for the leaf underside for whiteflies", () => {
    const facts = extractKnownFacts("Tomato whiteflies in Trinidad");
    const request = specificPhotoRequest({ facts });
    expect(request?.view).toBe("underside_of_leaf");
    expect(request?.farmerQuestion.toLowerCase()).toMatch(/underside/);
  });

  it("does not treat a specific stem photo ask as a generic photo ask", () => {
    expect(isGenericPhotoAsk("Can you send more photos?")).toBe(true);
    expect(
      isGenericPhotoAsk("Can you send a photo of a wilted plant with a stem cut open lengthwise?"),
    ).toBe(false);
  });
});
