/** Framework-free CV model consumed by every output boundary. */
export class CvDocument {
  constructor(data) {
    this.identity = {
      name: data.name,
      title: data.title,
      subtitle: data.subtitle || '',
      location: data.location,
      email: data.email,
      phone: data.phone,
      availability: data.availability || '',
      portfolio: data.portfolio || '',
      social: data.social || []
    };
    this.profile = data.profile;
    this.careerHighlights = data.career_highlights || [];
    this.skills = data.skills || [];
    this.experience = data.relevant_experience || [];
    this.education = data.education || [];
    this.languages = data.languages || [];
    this.certifications = data.certifications || [];
  }
}
