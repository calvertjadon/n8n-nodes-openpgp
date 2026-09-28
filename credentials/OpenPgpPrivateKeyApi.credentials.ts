import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class OpenPgpPrivateKeyApi implements ICredentialType {
	name = 'openPgpPrivateKeyApi';

	displayName = 'OpenPGP Private Key API';

	documentationUrl = 'https://github.com/calvertjadon/n8n-nodes-openpgp#credential-setup';

	icon = {
		light: 'file:openPgpPrivateKeyApi.svg',
		dark: 'file:openPgpPrivateKeyApi.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				password: true,
				rows: 6,
			},
			default: '',
			required: true,
			placeholder: 'e.g. -----BEGIN PGP PRIVATE KEY BLOCK-----',
			hint: "Paste the whole block, BEGIN and END lines included. A binary key file must be exported as armored text first, for example with 'gpg --armor --export-secret-keys'.",
			description:
				"The armored private key used to decrypt and sign. Paste the complete block, including the 'BEGIN' and 'END' lines.",
		},
		{
			displayName: 'Passphrase',
			name: 'passphrase',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			placeholder: 'e.g. privateKeyPassphrase',
			hint: "Leave empty when the key is not protected by a 'Passphrase'",
			description:
				"The 'Passphrase' that unlocks the private key. Leave empty when the key is not protected by one.",
		},
	];
}
