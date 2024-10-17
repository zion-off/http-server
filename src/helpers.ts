import { HTTPReq } from "./types.js";

export function parseRequest(requestString: string) {
  const parts = requestString.split(" ");
  if (parts.length === 3) {
    return {
      method: parts[0],
      path: parts[1],
      protocol: parts[2],
    } as HTTPReq;
  } else {
    throw new Error("Invalid request string format");
  }
}
