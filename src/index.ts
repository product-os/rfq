import * as capitano from 'capitano';
import * as fs from 'fs';
import * as _ from 'lodash';
import JSZip from 'jszip';
import * as Path from 'path';
import * as skhema from 'skhema';

const time = new Date().getTime();
const zip = new JSZip();

const generate = async (
	params: { folder: string },
	options: { output: string },
) => {

	const testFile = fs.readFileSync(
		Path.join(params.folder, 'testing', 'Testing.md'),
	);
	const testContent = Buffer.from(testFile).toString('utf8');
	zip.file('Testing.md', testContent);

	const specFile = JSON.parse(fs.readFileSync(Path.join(params.folder, 'source', 'specification', 'spec.json'),).toString('utf8'));
	const schema = await JSON.parse(
		fs
			.readFileSync(
				Path.join(
					__dirname,
					'../',
					'hardware-types',
					specFile.hwType,
					'rfq.json',
				),
			)
			.toString('utf8'),
	);

	const fileTypes = await JSON.parse(
		fs
			.readFileSync(
				Path.join(
					__dirname,
					'../',
					'hardware-types',
					specFile.hwType,
					'fileTypes.json',
				),
			)
			.toString('utf8'),
	);

	
	const rfq = await validateSpec(specFile, schema);
	zip.file('rfq.json', JSON.stringify(rfq, null, 2)); // add rfq.json to the release

	packageFiles(Path.join(params.folder, 'output'), fileTypes);

	const data = await zip.generateAsync({
		type: 'nodebuffer',
		compression: 'DEFLATE',
	});
	fs.writeFileSync(
		Path.join(options.output, `release_${time}.zip`),
		data,
		'binary',
	);
};

// check the spec file against schema for the project type - at the moment this filters out fields not in the schema.
const validateSpec = async (spec: any, schema: any) => {
	
	const partRFQ = skhema.filter(schema, spec);
	return partRFQ;
};

// get all files in output folder - should we restrict the file types to get depending on project type
const packageFiles = async (path: string, fileTypes: any) => {
	fs.readdirSync(path, { withFileTypes: true }).forEach((fileName) => {
		// nead this to be recursive
		// if its a directory, do it again - if its a file, zip it
		if (fileName.isDirectory()) {
			packageFiles(Path.join(path, fileName.name), fileTypes);
		} else {
			if(fileTypes.fileTypes.includes(Path.extname(Path.join(path, fileName.name)))){
				const fileRead = fs.readFileSync(Path.join(path, fileName.name));
				const fileContent = Buffer.from(fileRead).toString('utf8');
				zip.file(fileName.name, fileContent); // what should the files get called? is it ok just to dump all the files in there?
			}
		}
	});
};

capitano.command({
	signature: 'generate <folder>',
	description: 'Generate a target-specific RFQ from a repository',
	options: [
		{
			signature: 'output',
			parameter: 'output',
			alias: ['o'],
			description: 'Output directory, defaults to path if not specified',
		},
	],
	action: generate,
});

capitano.run(process.argv, (err: Error | null) => {
	if (err != null) {
		throw err;
	}
});
