export function parseRequest(requestString) {
    const parts = requestString.split(" ");
    if (parts.length === 3) {
        return {
            method: parts[0],
            path: parts[1],
            protocol: parts[2],
        };
    }
    else {
        throw new Error("Invalid request string format");
    }
}
//# sourceMappingURL=helpers.js.map