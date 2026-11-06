// Vite/Vitest `?raw` imports: tests read built and static files as strings without Node APIs.
declare module '*?raw' {
  const content: string;
  export default content;
}
