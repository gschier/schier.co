module.exports = {
  plugins: [
    require('autoprefixer'),
    require('postcss-nested'),
    require('postcss-import'),
    require('tailwindcss')({
      important: true,
      theme: require('./tailwind/theme'),
    }),
  ],
};
