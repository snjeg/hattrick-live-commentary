// Vite/Vitest `?raw` imports: tests load fixtures as strings without Node APIs.
declare module '*?raw' {
  const content: string;
  export default content;
}
