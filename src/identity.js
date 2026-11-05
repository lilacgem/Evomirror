// Identity metadata adapted from the creator's archived identity experiment.
// These identity labels describe provenance; they are not authentication controls.
import { BrandConfig } from './brand.config.js';
import AujouleMetadata from './metadata.js';

export const IdentitySeal = Object.freeze({
    creator: BrandConfig.identity.creator,
    rightsHolder: BrandConfig.identity.rightsHolder,
    signature: BrandConfig.identity.signature,
    engine: BrandConfig.identity.engine,
    environment: BrandConfig.identity.environment,
    handshake: AujouleMetadata.core_handshake,
    lineage: 'EvolvingRoots',
    themeColor: '#2E0A5E',
});

export function applyIdentity() {
    const tags = [...new Set([...(document.querySelector('meta[name="keywords"]')?.content.split(',').map(tag => tag.trim()).filter(Boolean) || []), ...BrandConfig.userTags,
        ...Object.values(AujouleMetadata.identity).flat(),
        ...Object.values(AujouleMetadata.philosophy).flat(),
        ...Object.values(AujouleMetadata.technical_specs).flat(),
        ...Object.values(AujouleMetadata.system_structure).flat(),
        'LisajEvokes', 'AuevoAujoulEvol LLC'])];
    const values = {
        author: IdentitySeal.creator,
        copyright: IdentitySeal.rightsHolder,
        keywords: tags.join(', '),
        'identity-signature': IdentitySeal.signature,
        'identity-handshake': IdentitySeal.handshake,
        'theme-color': IdentitySeal.themeColor,
    };
    for (const [name, content] of Object.entries(values)) {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.append(meta); }
        meta.content = content;
    }
}
