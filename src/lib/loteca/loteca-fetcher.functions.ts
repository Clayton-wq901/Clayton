import { createServerFn } from "@tanstack/react-start";
import { getLotecaGrade } from "./loteca-fetcher.server";

export const fetchLotecaGrade = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      return await getLotecaGrade();
    } catch (error) {
      console.error("Error fetching Lotéca grade:", error);
      throw error;
    }
  });
