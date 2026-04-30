import fs from "node:fs";

const files = [
  {
    source: ".env.example",
    target: ".env"
  },
  {
    source: "config.example.json",
    target: "config.json"
  }
];

for (const file of files) {
  if (fs.existsSync(file.target)) {
    console.log(`Keeping existing ${file.target}`);
    continue;
  }

  fs.copyFileSync(file.source, file.target);
  console.log(`Created ${file.target} from ${file.source}`);
}

console.log("");
console.log("Next steps:");
console.log("1. Add your NVIDIA_API_KEY to .env");
console.log("2. Run npm start");
console.log("3. Run npm link once if you want claudia-claude available from any project");
console.log("4. In a project directory, run claudia-claude");
