// esbuild's text loader (package.json): a .css file imports as its text.
declare module '*.css' {
  const text: string
  export default text
}
