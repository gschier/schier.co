module.exports = {
  plugins: [
    require('autoprefixer'),
    require('postcss-nested'),
    require('postcss-import'),
    require('tailwindcss')({
      important: true,
      purge: false,
      theme: require('./tailwind/theme'),
    }),
  ],
};
