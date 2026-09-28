import releaseItConfig from '../.release-it.json';
import { Bumper } from 'conventional-recommended-bump';
import { CommitParser } from 'conventional-commits-parser';
import { expect, it } from 'vitest';

interface ReleaseItConfig {
	plugins: {
		'@release-it/conventional-changelog': {
			preset: Parameters<Bumper['loadPreset']>[0];
		};
	};
}

async function recommendedReleaseType(message: string): Promise<string | undefined> {
	const config = releaseItConfig as ReleaseItConfig;
	const preset = config.plugins['@release-it/conventional-changelog'].preset;
	const commit = new CommitParser().parse(message);
	const bumper = new Bumper().loadPreset(preset).commits([commit]);

	return (await bumper.bump()).releaseType;
}

it.each([
	['fix(deps): update runtime dependency', 'patch'],
	['chore(deps): update development tools', 'patch'],
	['ci(deps): update workflow action', undefined],
	['chore: maintain repository metadata', undefined],
	['feat!: remove obsolete operation', 'major'],
])('maps %s to %s', async (message, releaseType) => {
	await expect(recommendedReleaseType(message)).resolves.toBe(releaseType);
});
